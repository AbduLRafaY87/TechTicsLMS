const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');
const { createNotification } = require('../utils/notifications');

const getEnrollmentRequests = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const status = req.query.status;

  const where = {};
  if (status && status !== 'ALL') {
    if (!['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      return res.status(422).json({ success: false, message: 'Invalid enrollment request status' });
    }
    where.status = status;
  }

  if (req.query.search) {
    where.OR = [
      { user: { name: { contains: req.query.search, mode: 'insensitive' } } },
      { user: { email: { contains: req.query.search, mode: 'insensitive' } } },
      { course: { title: { contains: req.query.search, mode: 'insensitive' } } },
    ];
  }

  try {
    const [requests, total] = await Promise.all([
      prisma.enrollmentRequest.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true, thumbnail: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
        orderBy: { requestedAt: 'desc' },
      }),
      prisma.enrollmentRequest.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(requests, total, page, limit) });
  } catch (err) {
    console.error('[getEnrollmentRequests]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getEnrollmentRequestStats = async (req, res) => {
  try {
    const [pending, approved, rejected, total] = await Promise.all([
      prisma.enrollmentRequest.count({ where: { status: 'PENDING' } }),
      prisma.enrollmentRequest.count({ where: { status: 'APPROVED' } }),
      prisma.enrollmentRequest.count({ where: { status: 'REJECTED' } }),
      prisma.enrollmentRequest.count(),
    ]);
    return res.status(200).json({
      success: true,
      data: { stats: { pending, approved, rejected, total } },
    });
  } catch (err) {
    console.error('[getEnrollmentRequestStats]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteEnrollmentRequest = async (req, res) => {
  try {
    await prisma.enrollmentRequest.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Enrollment request deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Enrollment request not found' });
    console.error('[deleteEnrollmentRequest]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const reviewEnrollmentRequest = (status) => async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const request = await tx.enrollmentRequest.findUnique({ where: { id: req.params.id } });
      if (!request) return { missing: true };

      const updated = await tx.enrollmentRequest.updateMany({
        where: { id: request.id, status: 'PENDING' },
        data: { status, reviewedAt: new Date(), reviewedById: req.user.id },
      });
      if (updated.count === 0) return { alreadyReviewed: true };

      if (status === 'APPROVED') {
        await tx.enrollment.upsert({
          where: { userId_courseId: { userId: request.userId, courseId: request.courseId } },
          update: {},
          create: { userId: request.userId, courseId: request.courseId },
        });
      }

      const reviewedRequest = await tx.enrollmentRequest.findUnique({
        where: { id: request.id },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true, thumbnail: true } },
          reviewedBy: { select: { id: true, name: true } },
        },
      });
      return { request: reviewedRequest };
    });

    if (result.missing) return res.status(404).json({ success: false, message: 'Enrollment request not found' });
    if (result.alreadyReviewed) return res.status(409).json({ success: false, message: 'Enrollment request has already been reviewed' });

    const { request } = result;
    await createNotification(
      request.user.id,
      status === 'APPROVED' ? 'Enrollment Approved' : 'Enrollment Rejected',
      status === 'APPROVED'
        ? `Your request to join "${request.course.title}" was approved`
        : `Your request to join "${request.course.title}" was rejected`,
      status === 'APPROVED' ? 'success' : 'warning',
      `/courses/${request.course.id}`
    );

    return res.status(200).json({
      success: true,
      message: status === 'APPROVED' ? 'Enrollment request approved' : 'Enrollment request rejected',
      data: { request },
    });
  } catch (err) {
    console.error('[reviewEnrollmentRequest]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  getEnrollmentRequests,
  getEnrollmentRequestStats,
  deleteEnrollmentRequest,
  approveEnrollmentRequest: reviewEnrollmentRequest('APPROVED'),
  rejectEnrollmentRequest: reviewEnrollmentRequest('REJECTED'),
};
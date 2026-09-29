const { validationResult } = require('express-validator');
const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');
const { createBulkNotifications } = require('../utils/notifications');

// GET /api/assignments?courseId=
const getAssignments = async (req, res) => {
  const { courseId } = req.query;
  const { page, limit, skip } = paginate(req.query);
  const where = {};
  if (courseId) where.courseId = courseId;
  if (req.user.role === 'STUDENT') where.isPublished = true;
  try {
    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where, skip, take: limit,
        include: { course: { select: { id: true, title: true } }, _count: { select: { submissions: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.assignment.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(assignments, total, page, limit) });
  } catch (err) {
    console.error('[getAssignments]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/assignments/:id
const getAssignmentById = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: req.params.id },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        submissions: req.user.role !== 'STUDENT'
          ? { include: { user: { select: { id: true, name: true, email: true, avatar: true } } } }
          : { where: { userId: req.user.id } },
        _count: { select: { submissions: true } },
      },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    return res.status(200).json({ success: true, data: { assignment } });
  } catch (err) {
    console.error('[getAssignmentById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/assignments
const createAssignment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  const { courseId, title, description, dueDate, maxScore } = req.body;
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role !== 'ADMIN' && course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const assignment = await prisma.assignment.create({
      data: { courseId, title, description, dueDate: dueDate ? new Date(dueDate) : null, maxScore: maxScore ?? 100 },
    });

    // Notify enrolled students
    const enrollments = await prisma.enrollment.findMany({ where: { courseId }, select: { userId: true } });
    await createBulkNotifications(
      enrollments.map(e => e.userId),
      'New Assignment',
      `"${title}" has been posted in ${course.title}`,
      'info',
      `/assignments/${assignment.id}`
    );

    return res.status(201).json({ success: true, message: 'Assignment created', data: { assignment } });
  } catch (err) {
    console.error('[createAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/assignments/:id
const updateAssignment = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (req.user.role !== 'ADMIN' && assignment.course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    const { title, description, dueDate, maxScore, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined)     data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (maxScore !== undefined)    data.maxScore    = maxScore;
    if (isPublished !== undefined) data.isPublished  = isPublished;

    const updated = await prisma.assignment.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Assignment updated', data: { assignment: updated } });
  } catch (err) {
    console.error('[updateAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/assignments/:id
const deleteAssignment = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    if (req.user.role !== 'ADMIN' && assignment.course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await prisma.assignment.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    console.error('[deleteAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAssignments, getAssignmentById, createAssignment, updateAssignment, deleteAssignment };
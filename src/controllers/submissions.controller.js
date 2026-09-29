const prisma = require('../config/prisma');
const { createNotification } = require('../utils/notifications');

// GET /api/submissions?assignmentId=
const getSubmissions = async (req, res) => {
  const { assignmentId, userId } = req.query;
  const where = {};
  if (assignmentId) where.assignmentId = assignmentId;
  // Students can only see their own
  if (req.user.role === 'STUDENT') where.userId = req.user.id;
  else if (userId) where.userId = userId;
  try {
    const submissions = await prisma.submission.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        assignment: { select: { id: true, title: true, maxScore: true, dueDate: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { submissions } });
  } catch (err) {
    console.error('[getSubmissions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/submissions/:id
const getSubmissionById = async (req, res) => {
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assignment: { include: { course: { select: { id: true, title: true, teacherId: true } } } },
      },
    });
    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found' });
    // Only submitter, teacher of course, or admin can view
    if (req.user.role === 'STUDENT' && sub.userId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return res.status(200).json({ success: true, data: { submission: sub } });
  } catch (err) {
    console.error('[getSubmissionById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/submissions
const createSubmission = async (req, res) => {
  const { assignmentId, content, fileUrl } = req.body;
  if (!assignmentId) return res.status(422).json({ success: false, message: 'assignmentId is required' });
  try {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { course: { select: { teacherId: true, title: true } } },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    // Determine status (late if past due date)
    const status = assignment.dueDate && new Date() > assignment.dueDate ? 'LATE' : 'SUBMITTED';

    const submission = await prisma.submission.upsert({
      where: { assignmentId_userId: { assignmentId, userId: req.user.id } },
      update: { content, fileUrl, status, submittedAt: new Date(), score: null, feedback: null, gradedAt: null },
      create: { assignmentId, userId: req.user.id, content, fileUrl, status },
    });

    // Notify teacher
    await createNotification(
      assignment.course.teacherId,
      'New Submission',
      `A student submitted "${assignment.title}"`,
      'info',
      `/assignments/${assignmentId}`
    );

    return res.status(201).json({ success: true, message: 'Submission saved', data: { submission } });
  } catch (err) {
    console.error('[createSubmission]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/submissions/:id/grade  (TEACHER / ADMIN)
const gradeSubmission = async (req, res) => {
  const { score, feedback } = req.body;
  if (score === undefined) return res.status(422).json({ success: false, message: 'score is required' });
  try {
    const sub = await prisma.submission.findUnique({
      where: { id: req.params.id },
      include: { assignment: { include: { course: true } } },
    });
    if (!sub) return res.status(404).json({ success: false, message: 'Submission not found' });
    if (req.user.role !== 'ADMIN' && sub.assignment.course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (score < 0 || score > sub.assignment.maxScore) {
      return res.status(422).json({ success: false, message: `Score must be between 0 and ${sub.assignment.maxScore}` });
    }

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { score, feedback, status: 'GRADED', gradedAt: new Date() },
    });

    // Notify student
    await createNotification(
      sub.userId,
      'Assignment Graded',
      `Your submission for "${sub.assignment.title}" has been graded: ${score}/${sub.assignment.maxScore}`,
      'success',
      `/assignments/${sub.assignmentId}`
    );

    return res.status(200).json({ success: true, message: 'Submission graded', data: { submission: updated } });
  } catch (err) {
    console.error('[gradeSubmission]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getSubmissions, getSubmissionById, createSubmission, gradeSubmission };
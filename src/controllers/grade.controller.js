const prisma = require('../config/prisma');

const getGrades = async (req, res) => {
  const { courseId, userId } = req.query;
  const where = {};
  if (courseId) where.courseId = courseId;
  if (req.user.role === 'STUDENT') where.userId = req.user.id;
  else if (userId) where.userId = userId;
  try {
    const grades = await prisma.grade.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { grades } });
  } catch (err) {
    console.error('[getGrades]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createGrade = async (req, res) => {
  const { userId, courseId, title, score, maxScore, type } = req.body;
  if (!userId || !courseId || !title || score === undefined)
    return res.status(422).json({ success: false, message: 'userId, courseId, title, and score are required' });
  try {
    const grade = await prisma.grade.create({
      data: { userId, courseId, title, score, maxScore: maxScore ?? 100, type: type ?? 'assignment' },
      include: {
        user: { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
      },
    });
    return res.status(201).json({ success: true, message: 'Grade recorded', data: { grade } });
  } catch (err) {
    console.error('[createGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateGrade = async (req, res) => {
  try {
    const grade = await prisma.grade.findUnique({ where: { id: req.params.id } });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    const { score, title, maxScore } = req.body;
    const data = {};
    if (score !== undefined) data.score = score;
    if (title !== undefined) data.title = title;
    if (maxScore !== undefined) data.maxScore = maxScore;
    const updated = await prisma.grade.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Grade updated', data: { grade: updated } });
  } catch (err) {
    console.error('[updateGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteGrade = async (req, res) => {
  try {
    await prisma.grade.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Grade deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Grade not found' });
    console.error('[deleteGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getGradebook = async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) return res.status(422).json({ success: false, message: 'courseId is required' });
  try {
    const grades = await prisma.grade.findMany({
      where: { courseId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
    });
    // Group by user
    const gradebook = grades.reduce((acc, grade) => {
      const key = grade.userId;
      if (!acc[key]) acc[key] = { user: grade.user, grades: [], average: 0 };
      acc[key].grades.push({ id: grade.id, title: grade.title, score: grade.score, maxScore: grade.maxScore, type: grade.type });
      return acc;
    }, {});
    // Calculate averages
    Object.values(gradebook).forEach(entry => {
      const total = entry.grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0);
      entry.average = entry.grades.length > 0 ? Math.round(total / entry.grades.length) : 0;
    });
    return res.status(200).json({ success: true, data: { gradebook: Object.values(gradebook) } });
  } catch (err) {
    console.error('[getGradebook]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getGrades, createGrade, updateGrade, deleteGrade, getGradebook };
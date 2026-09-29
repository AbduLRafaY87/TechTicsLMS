const prisma = require('../config/prisma');
const { validationResult } = require('express-validator');

const getLessons = async (req, res) => {
  const { moduleId } = req.query;
  if (!moduleId) return res.status(422).json({ success: false, message: 'moduleId query param required' });
  const where = { moduleId };
  if (req.user.role === 'STUDENT') where.isPublished = true;
  try {
    const lessons = await prisma.lesson.findMany({ where, orderBy: { order: 'asc' } });
    return res.status(200).json({ success: true, data: { lessons } });
  } catch (err) {
    console.error('[getLessons]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getLessonById = async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { module: { select: { id: true, title: true, courseId: true } } },
    });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    return res.status(200).json({ success: true, data: { lesson } });
  } catch (err) {
    console.error('[getLessonById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createLesson = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  const { moduleId, title, content, videoUrl, duration, order } = req.body;
  try {
    const mod = await prisma.module.findUnique({ where: { id: moduleId }, include: { course: true } });
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    if (req.user.role !== 'ADMIN' && mod.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const lesson = await prisma.lesson.create({
      data: { moduleId, title, content, videoUrl, duration, order: order ?? 0 },
    });
    return res.status(201).json({ success: true, message: 'Lesson created', data: { lesson } });
  } catch (err) {
    console.error('[createLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateLesson = async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    if (req.user.role !== 'ADMIN' && lesson.module.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const { title, content, videoUrl, duration, order, isPublished } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    if (videoUrl !== undefined) data.videoUrl = videoUrl;
    if (duration !== undefined) data.duration = duration;
    if (order !== undefined) data.order = order;
    if (isPublished !== undefined) data.isPublished = isPublished;
    const updated = await prisma.lesson.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Lesson updated', data: { lesson: updated } });
  } catch (err) {
    console.error('[updateLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteLesson = async (req, res) => {
  try {
    const lesson = await prisma.lesson.findUnique({
      where: { id: req.params.id },
      include: { module: { include: { course: true } } },
    });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });
    if (req.user.role !== 'ADMIN' && lesson.module.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.lesson.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Lesson deleted' });
  } catch (err) {
    console.error('[deleteLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getLessons, getLessonById, createLesson, updateLesson, deleteLesson };
const { validationResult } = require('express-validator');
const prisma = require('../config/prisma');

const _checkCourseOwner = async (courseId, userId, role) => {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) return { error: 'Course not found', status: 404 };
  if (role !== 'ADMIN' && course.teacherId !== userId) return { error: 'Forbidden', status: 403 };
  return { course };
};

// GET /api/modules?courseId=
const getModules = async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) return res.status(422).json({ success: false, message: 'courseId query param required' });
  try {
    const modules = await prisma.module.findMany({
      where: { courseId },
      include: { lessons: { orderBy: { order: 'asc' } }, _count: { select: { lessons: true } } },
      orderBy: { order: 'asc' },
    });
    return res.status(200).json({ success: true, data: { modules } });
  } catch (err) {
    console.error('[getModules]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/modules/:id
const getModuleById = async (req, res) => {
  try {
    const mod = await prisma.module.findUnique({
      where: { id: req.params.id },
      include: { lessons: { orderBy: { order: 'asc' } }, course: { select: { id: true, title: true } } },
    });
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    return res.status(200).json({ success: true, data: { module: mod } });
  } catch (err) {
    console.error('[getModuleById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/modules
const createModule = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  const { courseId, title, description, order } = req.body;
  const check = await _checkCourseOwner(courseId, req.user.id, req.user.role);
  if (check.error) return res.status(check.status).json({ success: false, message: check.error });
  try {
    const mod = await prisma.module.create({ data: { courseId, title, description, order: order ?? 0 } });
    return res.status(201).json({ success: true, message: 'Module created', data: { module: mod } });
  } catch (err) {
    console.error('[createModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/modules/:id
const updateModule = async (req, res) => {
  try {
    const mod = await prisma.module.findUnique({ where: { id: req.params.id } });
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    const check = await _checkCourseOwner(mod.courseId, req.user.id, req.user.role);
    if (check.error) return res.status(check.status).json({ success: false, message: check.error });

    const { title, description, order, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (order !== undefined)       data.order       = order;
    if (isPublished !== undefined) data.isPublished  = isPublished;

    const updated = await prisma.module.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Module updated', data: { module: updated } });
  } catch (err) {
    console.error('[updateModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/modules/:id
const deleteModule = async (req, res) => {
  try {
    const mod = await prisma.module.findUnique({ where: { id: req.params.id } });
    if (!mod) return res.status(404).json({ success: false, message: 'Module not found' });
    const check = await _checkCourseOwner(mod.courseId, req.user.id, req.user.role);
    if (check.error) return res.status(check.status).json({ success: false, message: check.error });
    await prisma.module.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Module deleted' });
  } catch (err) {
    console.error('[deleteModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getModules, getModuleById, createModule, updateModule, deleteModule };
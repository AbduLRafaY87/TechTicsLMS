const { validationResult } = require('express-validator');
const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');
const { createBulkNotifications } = require('../utils/notifications');

// GET /api/courses
const getAllCourses = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, teacherId } = req.query;

  const where = { isPublished: true };
  if (teacherId) where.teacherId = teacherId;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where, skip, take: limit,
        include: {
          teacher: { select: { id: true, name: true, email: true, avatar: true } },
          _count: { select: { enrollments: true, modules: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(courses, total, page, limit) });
  } catch (err) {
    console.error('[getAllCourses]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/courses/:id
const getCourseById = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        teacher: { select: { id: true, name: true, email: true, avatar: true, bio: true } },
        modules: {
          where: { isPublished: true },
          include: { lessons: { where: { isPublished: true }, orderBy: { order: 'asc' } } },
          orderBy: { order: 'asc' },
        },
        enrollments: { include: { user: { select: { id: true, name: true, avatar: true } } } },
        _count: { select: { enrollments: true, modules: true, assignments: true, quizzes: true } },
      },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    return res.status(200).json({ success: true, data: { course } });
  } catch (err) {
    console.error('[getCourseById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/courses
const createCourse = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { title, description, thumbnail } = req.body;
  try {
    const course = await prisma.course.create({
      data: { title, description, thumbnail, teacherId: req.user.id },
      include: { teacher: { select: { id: true, name: true, email: true } } },
    });
    return res.status(201).json({ success: true, message: 'Course created', data: { course } });
  } catch (err) {
    console.error('[createCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/courses/:id
const updateCourse = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { id } = req.params;
  try {
    const course = await prisma.course.findUnique({ where: { id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role !== 'ADMIN' && course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const { title, description, thumbnail, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (thumbnail !== undefined)   data.thumbnail   = thumbnail;
    if (isPublished !== undefined) data.isPublished  = isPublished;

    const updated = await prisma.course.update({
      where: { id }, data,
      include: { teacher: { select: { id: true, name: true, email: true } } },
    });
    return res.status(200).json({ success: true, message: 'Course updated', data: { course: updated } });
  } catch (err) {
    console.error('[updateCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/courses/:id
const deleteCourse = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role !== 'ADMIN' && course.teacherId !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    await prisma.course.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Course deleted' });
  } catch (err) {
    console.error('[deleteCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/courses/:id/enroll
const enrollCourse = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const enrollment = await prisma.enrollment.create({
      data: { userId: req.user.id, courseId: req.params.id },
    });

    // Notify the teacher
    await createBulkNotifications(
      [course.teacherId],
      'New Enrollment',
      `A student enrolled in "${course.title}"`,
      'info',
      `/courses/${course.id}`
    );

    return res.status(201).json({ success: true, message: 'Enrolled successfully', data: { enrollment } });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, message: 'Already enrolled' });
    console.error('[enrollCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/courses/:id/enroll
const unenrollCourse = async (req, res) => {
  try {
    await prisma.enrollment.delete({
      where: { userId_courseId: { userId: req.user.id, courseId: req.params.id } },
    });
    return res.status(200).json({ success: true, message: 'Unenrolled successfully' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Enrollment not found' });
    console.error('[unenrollCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/courses/:id/students
const getCourseStudents = async (req, res) => {
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.id } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId: req.params.id },
      include: { user: { select: { id: true, name: true, email: true, avatar: true, createdAt: true } } },
      orderBy: { enrolledAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { students: enrollments.map(e => ({ ...e.user, enrolledAt: e.enrolledAt })) } });
  } catch (err) {
    console.error('[getCourseStudents]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
// GET /api/courses/my-courses
const getMyCourses = async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId: req.user.id },
      include: { course: { select: { id: true, title: true } } },
    });
    const courses = enrollments.map(e => e.course);
    return res.status(200).json({ success: true, data: { courses } });
  } catch (err) {
    console.error('[getMyCourses]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAllCourses, getCourseById, createCourse, updateCourse, deleteCourse, enrollCourse, unenrollCourse, getCourseStudents, getMyCourses };
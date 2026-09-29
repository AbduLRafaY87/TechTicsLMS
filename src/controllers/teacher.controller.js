const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');

// ─── Dashboard ────────────────────────────────────────────────────────────────

// GET /api/teacher/dashboard
const getTeacherDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;

    const [courses, totalStudents, pendingSubmissions, unreadNotifications] = await Promise.all([
      prisma.course.count({ where: { teacherId } }),
      prisma.enrollment.count({ where: { course: { teacherId } } }),
      prisma.submission.count({
        where: { status: 'SUBMITTED', assignment: { course: { teacherId } } },
      }),
      prisma.notification.count({ where: { userId: teacherId, isRead: false } }),
    ]);

    const [recentEnrollments, pendingGrading, recentCourses, monthlyStats] = await Promise.all([
      prisma.enrollment.findMany({
        where: { course: { teacherId } },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true } },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 10,
      }),
      prisma.submission.findMany({
        where: { status: 'SUBMITTED', assignment: { course: { teacherId } } },
        include: {
          user: { select: { id: true, name: true, avatar: true } },
          assignment: {
            select: {
              id: true,
              title: true,
              maxScore: true,
              dueDate: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { submittedAt: 'asc' },
        take: 10,
      }),
      prisma.course.findMany({
        where: { teacherId },
        include: {
          _count: { select: { enrollments: true, modules: true, assignments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      // Enrollments per day for last 7 days
      prisma.enrollment.groupBy({
        by: ['enrolledAt'],
        where: {
          course: { teacherId },
          enrolledAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        _count: { id: true },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        stats: { courses, totalStudents, pendingSubmissions, unreadNotifications },
        recentEnrollments,
        pendingGrading,
        recentCourses,
        monthlyStats,
      },
    });
  } catch (err) {
    console.error('[getTeacherDashboard]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Courses ──────────────────────────────────────────────────────────────────

// GET /api/teacher/courses
const getTeacherCourses = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search, isPublished } = req.query;
  const where = { teacherId: req.user.id };

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }
  if (isPublished !== undefined) where.isPublished = isPublished === 'true';

  try {
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where,
        skip,
        take: limit,
        include: {
          _count: { select: { enrollments: true, modules: true, assignments: true, quizzes: true } },
          modules: {
            include: { _count: { select: { lessons: true } } },
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.course.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(courses, total, page, limit) });
  } catch (err) {
    console.error('[getTeacherCourses]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/courses/:id
const getTeacherCourseById = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
      include: {
        modules: {
          include: {
            lessons: { orderBy: { order: 'asc' } },
            _count: { select: { lessons: true } },
          },
          orderBy: { order: 'asc' },
        },
        assignments: {
          include: { _count: { select: { submissions: true } } },
          orderBy: { createdAt: 'desc' },
        },
        quizzes: {
          include: { _count: { select: { questions: true, attempts: true } } },
          orderBy: { createdAt: 'desc' },
        },
        enrollments: {
          include: { user: { select: { id: true, name: true, email: true, avatar: true } } },
          orderBy: { enrolledAt: 'desc' },
        },
        announcements: { orderBy: { createdAt: 'desc' } },
        _count: { select: { enrollments: true, modules: true, assignments: true, quizzes: true } },
      },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    return res.status(200).json({ success: true, data: { course } });
  } catch (err) {
    console.error('[getTeacherCourseById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/courses
const createTeacherCourse = async (req, res) => {
  const { title, description, thumbnail } = req.body;
  if (!title) return res.status(422).json({ success: false, message: 'Title is required' });

  try {
    const course = await prisma.course.create({
      data: { title, description, thumbnail, teacherId: req.user.id },
      include: { teacher: { select: { id: true, name: true, email: true } } },
    });
    return res.status(201).json({ success: true, message: 'Course created', data: { course } });
  } catch (err) {
    console.error('[createTeacherCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/courses/:id
const updateTeacherCourse = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const { title, description, thumbnail, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (thumbnail !== undefined)   data.thumbnail   = thumbnail;
    if (isPublished !== undefined) data.isPublished = isPublished;

    const updated = await prisma.course.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Course updated', data: { course: updated } });
  } catch (err) {
    console.error('[updateTeacherCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/courses/:id
const deleteTeacherCourse = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    await prisma.course.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Course deleted' });
  } catch (err) {
    console.error('[deleteTeacherCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/courses/:id/publish
const toggleCoursePublish = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const updated = await prisma.course.update({
      where: { id: req.params.id },
      data: { isPublished: !course.isPublished },
    });
    return res.status(200).json({
      success: true,
      message: `Course ${updated.isPublished ? 'published' : 'unpublished'}`,
      data: { course: updated },
    });
  } catch (err) {
    console.error('[toggleCoursePublish]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Course Students ──────────────────────────────────────────────────────────

// GET /api/teacher/courses/:id/students
const getCourseStudents = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const [enrollments, total] = await Promise.all([
      prisma.enrollment.findMany({
        where: { courseId: req.params.id },
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, email: true, avatar: true, phone: true, createdAt: true },
          },
        },
        orderBy: { enrolledAt: 'desc' },
      }),
      prisma.enrollment.count({ where: { courseId: req.params.id } }),
    ]);

    const students = enrollments.map((e) => ({ ...e.user, enrolledAt: e.enrolledAt, enrollmentId: e.id }));
    return res.status(200).json({ success: true, ...paginatedResponse(students, total, page, limit) });
  } catch (err) {
    console.error('[getCourseStudents]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/courses/:id/students/:userId  — remove a student
const removeStudentFromCourse = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    await prisma.enrollment.deleteMany({
      where: { courseId: req.params.id, userId: req.params.userId },
    });
    return res.status(200).json({ success: true, message: 'Student removed from course' });
  } catch (err) {
    console.error('[removeStudentFromCourse]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Modules ──────────────────────────────────────────────────────────────────

// GET /api/teacher/courses/:id/modules
const getCourseModules = async (req, res) => {
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const modules = await prisma.module.findMany({
      where: { courseId: req.params.id },
      include: {
        lessons: { orderBy: { order: 'asc' } },
        _count: { select: { lessons: true } },
      },
      orderBy: { order: 'asc' },
    });
    return res.status(200).json({ success: true, data: { modules } });
  } catch (err) {
    console.error('[getCourseModules]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/courses/:id/modules
const createCourseModule = async (req, res) => {
  const { title, description, order } = req.body;
  if (!title) return res.status(422).json({ success: false, message: 'Title is required' });
  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    // Auto-order: put at end if not specified
    let moduleOrder = order;
    if (moduleOrder === undefined) {
      const lastModule = await prisma.module.findFirst({
        where: { courseId: req.params.id },
        orderBy: { order: 'desc' },
      });
      moduleOrder = lastModule ? lastModule.order + 1 : 0;
    }

    const module = await prisma.module.create({
      data: { courseId: req.params.id, title, description, order: moduleOrder },
    });
    return res.status(201).json({ success: true, message: 'Module created', data: { module } });
  } catch (err) {
    console.error('[createCourseModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/modules/:moduleId
const updateModule = async (req, res) => {
  try {
    const mod = await prisma.module.findFirst({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    if (!mod || mod.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Module not found' });

    const { title, description, order, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (order !== undefined)       data.order       = order;
    if (isPublished !== undefined) data.isPublished = isPublished;

    const updated = await prisma.module.update({ where: { id: req.params.moduleId }, data });
    return res.status(200).json({ success: true, message: 'Module updated', data: { module: updated } });
  } catch (err) {
    console.error('[updateModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/modules/:moduleId
const deleteModule = async (req, res) => {
  try {
    const mod = await prisma.module.findFirst({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    if (!mod || mod.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Module not found' });

    await prisma.module.delete({ where: { id: req.params.moduleId } });
    return res.status(200).json({ success: true, message: 'Module deleted' });
  } catch (err) {
    console.error('[deleteModule]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/courses/:id/modules/reorder
const reorderModules = async (req, res) => {
  // Body: { modules: [{ id, order }] }
  const { modules } = req.body;
  if (!Array.isArray(modules))
    return res.status(422).json({ success: false, message: 'modules array is required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: req.params.id, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    await Promise.all(
      modules.map(({ id, order }) => prisma.module.update({ where: { id }, data: { order } }))
    );
    return res.status(200).json({ success: true, message: 'Modules reordered' });
  } catch (err) {
    console.error('[reorderModules]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Lessons ──────────────────────────────────────────────────────────────────

// GET /api/teacher/modules/:moduleId/lessons
const getModuleLessons = async (req, res) => {
  try {
    const mod = await prisma.module.findFirst({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    if (!mod || mod.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Module not found' });

    const lessons = await prisma.lesson.findMany({
      where: { moduleId: req.params.moduleId },
      orderBy: { order: 'asc' },
    });
    return res.status(200).json({ success: true, data: { lessons } });
  } catch (err) {
    console.error('[getModuleLessons]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/modules/:moduleId/lessons
const createLesson = async (req, res) => {
  const { title, content, videoUrl, duration, order } = req.body;
  if (!title) return res.status(422).json({ success: false, message: 'Title is required' });

  try {
    const mod = await prisma.module.findFirst({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    if (!mod || mod.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Module not found' });

    let lessonOrder = order;
    if (lessonOrder === undefined) {
      const lastLesson = await prisma.lesson.findFirst({
        where: { moduleId: req.params.moduleId },
        orderBy: { order: 'desc' },
      });
      lessonOrder = lastLesson ? lastLesson.order + 1 : 0;
    }

    const lesson = await prisma.lesson.create({
      data: {
        moduleId: req.params.moduleId,
        title,
        content,
        videoUrl,
        duration: duration ? parseInt(duration) : null,
        order: lessonOrder,
      },
    });
    return res.status(201).json({ success: true, message: 'Lesson created', data: { lesson } });
  } catch (err) {
    console.error('[createLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/lessons/:lessonId
const updateLesson = async (req, res) => {
  try {
    const lesson = await prisma.lesson.findFirst({
      where: { id: req.params.lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson || lesson.module.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Lesson not found' });

    const { title, content, videoUrl, duration, order, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (content !== undefined)     data.content     = content;
    if (videoUrl !== undefined)    data.videoUrl    = videoUrl;
    if (duration !== undefined)    data.duration    = duration ? parseInt(duration) : null;
    if (order !== undefined)       data.order       = order;
    if (isPublished !== undefined) data.isPublished = isPublished;

    const updated = await prisma.lesson.update({ where: { id: req.params.lessonId }, data });
    return res.status(200).json({ success: true, message: 'Lesson updated', data: { lesson: updated } });
  } catch (err) {
    console.error('[updateLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/lessons/:lessonId
const deleteLesson = async (req, res) => {
  try {
    const lesson = await prisma.lesson.findFirst({
      where: { id: req.params.lessonId },
      include: { module: { include: { course: true } } },
    });
    if (!lesson || lesson.module.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Lesson not found' });

    await prisma.lesson.delete({ where: { id: req.params.lessonId } });
    return res.status(200).json({ success: true, message: 'Lesson deleted' });
  } catch (err) {
    console.error('[deleteLesson]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/modules/:moduleId/lessons/reorder
const reorderLessons = async (req, res) => {
  const { lessons } = req.body;
  if (!Array.isArray(lessons))
    return res.status(422).json({ success: false, message: 'lessons array is required' });

  try {
    const mod = await prisma.module.findFirst({
      where: { id: req.params.moduleId },
      include: { course: true },
    });
    if (!mod || mod.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Module not found' });

    await Promise.all(
      lessons.map(({ id, order }) => prisma.lesson.update({ where: { id }, data: { order } }))
    );
    return res.status(200).json({ success: true, message: 'Lessons reordered' });
  } catch (err) {
    console.error('[reorderLessons]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Assignments ──────────────────────────────────────────────────────────────

// GET /api/teacher/assignments
const getTeacherAssignments = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { courseId } = req.query;
  const where = { course: { teacherId: req.user.id } };
  if (courseId) where.courseId = courseId;

  try {
    const [assignments, total] = await Promise.all([
      prisma.assignment.findMany({
        where,
        skip,
        take: limit,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { submissions: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.assignment.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(assignments, total, page, limit) });
  } catch (err) {
    console.error('[getTeacherAssignments]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/assignments/:id
const getTeacherAssignmentById = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
      include: {
        course: { select: { id: true, title: true } },
        submissions: {
          include: {
            user: { select: { id: true, name: true, email: true, avatar: true } },
          },
          orderBy: { submittedAt: 'desc' },
        },
        _count: { select: { submissions: true } },
      },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    return res.status(200).json({ success: true, data: { assignment } });
  } catch (err) {
    console.error('[getTeacherAssignmentById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/assignments
const createAssignment = async (req, res) => {
  const { courseId, title, description, dueDate, maxScore } = req.body;
  if (!courseId || !title)
    return res.status(422).json({ success: false, message: 'courseId and title are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const assignment = await prisma.assignment.create({
      data: {
        courseId,
        title,
        description,
        dueDate: dueDate ? new Date(dueDate) : null,
        maxScore: maxScore ?? 100,
      },
    });

    // Notify enrolled students
    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      select: { userId: true },
    });
    if (enrollments.length > 0) {
      await prisma.notification.createMany({
        data: enrollments.map((e) => ({
          userId: e.userId,
          title: 'New Assignment',
          message: `"${title}" has been posted in ${course.title}`,
          type: 'info',
          link: `/assignments/${assignment.id}`,
        })),
      });
    }

    return res.status(201).json({ success: true, message: 'Assignment created', data: { assignment } });
  } catch (err) {
    console.error('[createAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/assignments/:id
const updateAssignment = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });

    const { title, description, dueDate, maxScore, isPublished } = req.body;
    const data = {};
    if (title !== undefined)       data.title       = title;
    if (description !== undefined) data.description = description;
    if (dueDate !== undefined)     data.dueDate     = dueDate ? new Date(dueDate) : null;
    if (maxScore !== undefined)    data.maxScore    = maxScore;
    if (isPublished !== undefined) data.isPublished = isPublished;

    const updated = await prisma.assignment.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Assignment updated', data: { assignment: updated } });
  } catch (err) {
    console.error('[updateAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/assignments/:id
const deleteAssignment = async (req, res) => {
  try {
    const assignment = await prisma.assignment.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
    await prisma.assignment.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Assignment deleted' });
  } catch (err) {
    console.error('[deleteAssignment]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Submissions ──────────────────────────────────────────────────────────────

// GET /api/teacher/submissions
const getTeacherSubmissions = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { assignmentId, courseId, status } = req.query;
  const where = { assignment: { course: { teacherId: req.user.id } } };

  if (assignmentId) where.assignmentId = assignmentId;
  if (courseId)     where.assignment   = { ...where.assignment, courseId };
  if (status)       where.status       = status;

  try {
    const [submissions, total] = await Promise.all([
      prisma.submission.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          assignment: {
            select: {
              id: true,
              title: true,
              maxScore: true,
              dueDate: true,
              course: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.submission.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(submissions, total, page, limit) });
  } catch (err) {
    console.error('[getTeacherSubmissions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/submissions/:id
const getSubmissionById = async (req, res) => {
  try {
    const submission = await prisma.submission.findFirst({
      where: { id: req.params.id, assignment: { course: { teacherId: req.user.id } } },
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        assignment: {
          include: { course: { select: { id: true, title: true } } },
        },
      },
    });
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });
    return res.status(200).json({ success: true, data: { submission } });
  } catch (err) {
    console.error('[getSubmissionById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/submissions/:id/grade
const gradeSubmission = async (req, res) => {
  const { score, feedback } = req.body;
  if (score === undefined) return res.status(422).json({ success: false, message: 'score is required' });

  try {
    const submission = await prisma.submission.findFirst({
      where: { id: req.params.id, assignment: { course: { teacherId: req.user.id } } },
      include: { assignment: true },
    });
    if (!submission) return res.status(404).json({ success: false, message: 'Submission not found' });

    if (score < 0 || score > submission.assignment.maxScore) {
      return res.status(422).json({
        success: false,
        message: `Score must be between 0 and ${submission.assignment.maxScore}`,
      });
    }

    const updated = await prisma.submission.update({
      where: { id: req.params.id },
      data: { score, feedback, status: 'GRADED', gradedAt: new Date() },
    });

    // Notify student
    await prisma.notification.create({
      data: {
        userId: submission.userId,
        title: 'Assignment Graded',
        message: `Your submission for "${submission.assignment.title}" has been graded: ${score}/${submission.assignment.maxScore}`,
        type: 'success',
        link: `/assignments/${submission.assignmentId}`,
      },
    });

    return res.status(200).json({ success: true, message: 'Submission graded', data: { submission: updated } });
  } catch (err) {
    console.error('[gradeSubmission]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/submissions/bulk-grade  — grade multiple at once
const bulkGradeSubmissions = async (req, res) => {
  // Body: { grades: [{ submissionId, score, feedback }] }
  const { grades } = req.body;
  if (!Array.isArray(grades) || grades.length === 0)
    return res.status(422).json({ success: false, message: 'grades array is required' });

  try {
    const results = await Promise.allSettled(
      grades.map(async ({ submissionId, score, feedback }) => {
        const sub = await prisma.submission.findFirst({
          where: { id: submissionId, assignment: { course: { teacherId: req.user.id } } },
          include: { assignment: true },
        });
        if (!sub) throw new Error(`Submission ${submissionId} not found`);
        const updated = await prisma.submission.update({
          where: { id: submissionId },
          data: { score, feedback, status: 'GRADED', gradedAt: new Date() },
        });
        await prisma.notification.create({
          data: {
            userId: sub.userId,
            title: 'Assignment Graded',
            message: `Your submission for "${sub.assignment.title}" has been graded: ${score}/${sub.assignment.maxScore}`,
            type: 'success',
            link: `/assignments/${sub.assignmentId}`,
          },
        });
        return updated;
      })
    );

    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed    = results.filter((r) => r.status === 'rejected').length;
    return res.status(200).json({
      success: true,
      message: `${succeeded} graded, ${failed} failed`,
      data: { results: results.map((r) => (r.status === 'fulfilled' ? r.value : { error: r.reason?.message })) },
    });
  } catch (err) {
    console.error('[bulkGradeSubmissions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Quizzes ──────────────────────────────────────────────────────────────────

// GET /api/teacher/quizzes
const getTeacherQuizzes = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { courseId } = req.query;
  const where = { course: { teacherId: req.user.id } };
  if (courseId) where.courseId = courseId;

  try {
    const [quizzes, total] = await Promise.all([
      prisma.quiz.findMany({
        where,
        skip,
        take: limit,
        include: {
          course: { select: { id: true, title: true } },
          _count: { select: { questions: true, attempts: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.quiz.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(quizzes, total, page, limit) });
  } catch (err) {
    console.error('[getTeacherQuizzes]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/quizzes/:id
const getTeacherQuizById = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
      include: {
        course: { select: { id: true, title: true } },
        questions: { orderBy: { order: 'asc' } },
        attempts: {
          include: { user: { select: { id: true, name: true, email: true } } },
          orderBy: { startedAt: 'desc' },
        },
        _count: { select: { questions: true, attempts: true } },
      },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    return res.status(200).json({ success: true, data: { quiz } });
  } catch (err) {
    console.error('[getTeacherQuizById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/quizzes
const createQuiz = async (req, res) => {
  const { courseId, title, description, duration, maxAttempts, passingScore } = req.body;
  if (!courseId || !title)
    return res.status(422).json({ success: false, message: 'courseId and title are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const quiz = await prisma.quiz.create({
      data: {
        courseId,
        title,
        description,
        duration: duration ? parseInt(duration) : null,
        maxAttempts: maxAttempts ?? 1,
        passingScore: passingScore ?? 60,
      },
    });
    return res.status(201).json({ success: true, message: 'Quiz created', data: { quiz } });
  } catch (err) {
    console.error('[createQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/quizzes/:id
const updateQuiz = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    const { title, description, duration, maxAttempts, passingScore, status } = req.body;
    const data = {};
    if (title !== undefined)        data.title        = title;
    if (description !== undefined)  data.description  = description;
    if (duration !== undefined)     data.duration     = duration ? parseInt(duration) : null;
    if (maxAttempts !== undefined)  data.maxAttempts  = maxAttempts;
    if (passingScore !== undefined) data.passingScore = passingScore;
    if (status !== undefined)       data.status       = status;

    const updated = await prisma.quiz.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Quiz updated', data: { quiz: updated } });
  } catch (err) {
    console.error('[updateQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/quizzes/:id
const deleteQuiz = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    await prisma.quiz.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Quiz deleted' });
  } catch (err) {
    console.error('[deleteQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/quizzes/:id/publish
const toggleQuizStatus = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    const newStatus = quiz.status === 'PUBLISHED' ? 'ARCHIVED' : 'PUBLISHED';
    const updated = await prisma.quiz.update({ where: { id: req.params.id }, data: { status: newStatus } });
    return res.status(200).json({
      success: true,
      message: `Quiz ${newStatus.toLowerCase()}`,
      data: { quiz: updated },
    });
  } catch (err) {
    console.error('[toggleQuizStatus]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Questions ────────────────────────────────────────────────────────────────

// GET /api/teacher/quizzes/:id/questions
const getQuizQuestions = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    const questions = await prisma.question.findMany({
      where: { quizId: req.params.id },
      orderBy: { order: 'asc' },
    });
    return res.status(200).json({ success: true, data: { questions } });
  } catch (err) {
    console.error('[getQuizQuestions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/quizzes/:id/questions
const addQuestion = async (req, res) => {
  const { text, options, correctOption, explanation, points, order } = req.body;
  if (!text || !options || !correctOption)
    return res.status(422).json({ success: false, message: 'text, options, and correctOption are required' });

  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    let questionOrder = order;
    if (questionOrder === undefined) {
      const lastQ = await prisma.question.findFirst({
        where: { quizId: req.params.id },
        orderBy: { order: 'desc' },
      });
      questionOrder = lastQ ? lastQ.order + 1 : 0;
    }

    const question = await prisma.question.create({
      data: {
        quizId: req.params.id,
        text,
        options,
        correctOption,
        explanation,
        points: points ?? 1,
        order: questionOrder,
      },
    });
    return res.status(201).json({ success: true, message: 'Question added', data: { question } });
  } catch (err) {
    console.error('[addQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/quizzes/:id/questions/bulk  — add multiple questions at once
const bulkAddQuestions = async (req, res) => {
  const { questions } = req.body;
  if (!Array.isArray(questions) || questions.length === 0)
    return res.status(422).json({ success: false, message: 'questions array is required' });

  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    const lastQ = await prisma.question.findFirst({
      where: { quizId: req.params.id },
      orderBy: { order: 'desc' },
    });
    let startOrder = lastQ ? lastQ.order + 1 : 0;

    const created = await prisma.question.createMany({
      data: questions.map((q, i) => ({
        quizId: req.params.id,
        text: q.text,
        options: q.options,
        correctOption: q.correctOption,
        explanation: q.explanation ?? null,
        points: q.points ?? 1,
        order: q.order !== undefined ? q.order : startOrder + i,
      })),
    });
    return res.status(201).json({ success: true, message: `${created.count} questions added` });
  } catch (err) {
    console.error('[bulkAddQuestions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/questions/:questionId
const updateQuestion = async (req, res) => {
  try {
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId },
      include: { quiz: { include: { course: true } } },
    });
    if (!question || question.quiz.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Question not found' });

    const { text, options, correctOption, explanation, points, order } = req.body;
    const data = {};
    if (text !== undefined)          data.text          = text;
    if (options !== undefined)       data.options       = options;
    if (correctOption !== undefined) data.correctOption = correctOption;
    if (explanation !== undefined)   data.explanation   = explanation;
    if (points !== undefined)        data.points        = points;
    if (order !== undefined)         data.order         = order;

    const updated = await prisma.question.update({ where: { id: req.params.questionId }, data });
    return res.status(200).json({ success: true, message: 'Question updated', data: { question: updated } });
  } catch (err) {
    console.error('[updateQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/questions/:questionId
const deleteQuestion = async (req, res) => {
  try {
    const question = await prisma.question.findFirst({
      where: { id: req.params.questionId },
      include: { quiz: { include: { course: true } } },
    });
    if (!question || question.quiz.course.teacherId !== req.user.id)
      return res.status(404).json({ success: false, message: 'Question not found' });

    await prisma.question.delete({ where: { id: req.params.questionId } });
    return res.status(200).json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error('[deleteQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Attendance ───────────────────────────────────────────────────────────────

// GET /api/teacher/attendance
const getTeacherAttendance = async (req, res) => {
  const { courseId, userId, date } = req.query;
  const where = { course: { teacherId: req.user.id } };
  if (courseId) where.courseId = courseId;
  if (userId)   where.userId   = userId;
  if (date)     where.date     = { gte: new Date(date) };

  try {
    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        user:   { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    });
    return res.status(200).json({ success: true, data: { attendance } });
  } catch (err) {
    console.error('[getTeacherAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/attendance
const markAttendance = async (req, res) => {
  const { userId, courseId, status, note, date } = req.body;
  if (!userId || !courseId)
    return res.status(422).json({ success: false, message: 'userId and courseId are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const attendanceDate = date ? new Date(date) : new Date();
    const attendance = await prisma.attendance.upsert({
      where: { userId_courseId_date: { userId, courseId, date: attendanceDate } },
      update: { status: status ?? 'PRESENT', note },
      create: { userId, courseId, status: status ?? 'PRESENT', note, date: attendanceDate },
    });
    return res.status(201).json({ success: true, message: 'Attendance recorded', data: { attendance } });
  } catch (err) {
    console.error('[markAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/attendance/bulk
const markBulkAttendance = async (req, res) => {
  const { courseId, date, records } = req.body;
  if (!courseId || !Array.isArray(records) || records.length === 0)
    return res.status(422).json({ success: false, message: 'courseId and records array are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const attendanceDate = date ? new Date(date) : new Date();
    const results = await Promise.allSettled(
      records.map(({ userId, status, note }) =>
        prisma.attendance.upsert({
          where: { userId_courseId_date: { userId, courseId, date: attendanceDate } },
          update: { status: status ?? 'PRESENT', note },
          create: { userId, courseId, status: status ?? 'PRESENT', note, date: attendanceDate },
        })
      )
    );
    const saved = results.filter((r) => r.status === 'fulfilled').length;
    return res.status(201).json({ success: true, message: `${saved}/${records.length} records saved` });
  } catch (err) {
    console.error('[markBulkAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/attendance/summary
const getAttendanceSummary = async (req, res) => {
  const { courseId, userId } = req.query;
  if (!courseId) return res.status(422).json({ success: false, message: 'courseId is required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const where = { courseId };
    if (userId) where.userId = userId;

    const records = await prisma.attendance.findMany({
      where,
      select: { status: true, userId: true },
    });

    if (userId) {
      // Per-student summary
      const summary = records.reduce((acc, { status }) => {
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {});
      const total   = records.length;
      const present = (summary.PRESENT || 0) + (summary.LATE || 0);
      return res.status(200).json({
        success: true,
        data: { summary, total, attendancePercentage: total > 0 ? Math.round((present / total) * 100) : 0 },
      });
    }

    // All students in course
    const grouped = records.reduce((acc, { status, userId: uid }) => {
      if (!acc[uid]) acc[uid] = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
      acc[uid][status] = (acc[uid][status] || 0) + 1;
      return acc;
    }, {});

    const total = records.length;
    const summary = records.reduce((acc, { status }) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const present = (summary.PRESENT || 0) + (summary.LATE || 0);

    return res.status(200).json({
      success: true,
      data: {
        summary,
        total,
        attendancePercentage: total > 0 ? Math.round((present / total) * 100) : 0,
        byStudent: grouped,
      },
    });
  } catch (err) {
    console.error('[getAttendanceSummary]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Announcements ────────────────────────────────────────────────────────────

// GET /api/teacher/announcements
const getTeacherAnnouncements = async (req, res) => {
  const { courseId } = req.query;
  const where = { course: { teacherId: req.user.id } };
  if (courseId) where.courseId = courseId;

  try {
    const announcements = await prisma.announcement.findMany({
      where,
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { announcements } });
  } catch (err) {
    console.error('[getTeacherAnnouncements]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/announcements
const createAnnouncement = async (req, res) => {
  const { courseId, title, content } = req.body;
  if (!courseId || !title || !content)
    return res.status(422).json({ success: false, message: 'courseId, title, and content are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const announcement = await prisma.announcement.create({ data: { courseId, title, content } });

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      select: { userId: true },
    });
    if (enrollments.length > 0) {
      await prisma.notification.createMany({
        data: enrollments.map((e) => ({
          userId: e.userId,
          title: `Announcement: ${title}`,
          message: `New announcement in ${course.title}`,
          type: 'info',
          link: `/courses/${courseId}`,
        })),
      });
    }
    return res.status(201).json({ success: true, message: 'Announcement created', data: { announcement } });
  } catch (err) {
    console.error('[createAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/announcements/:id
const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });

    const { title, content } = req.body;
    const data = {};
    if (title !== undefined)   data.title   = title;
    if (content !== undefined) data.content = content;

    const updated = await prisma.announcement.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Announcement updated', data: { announcement: updated } });
  } catch (err) {
    console.error('[updateAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/announcements/:id
const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    await prisma.announcement.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    console.error('[deleteAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Grades ───────────────────────────────────────────────────────────────────

// GET /api/teacher/grades
const getTeacherGrades = async (req, res) => {
  const { courseId, userId } = req.query;
  const where = { course: { teacherId: req.user.id } };
  if (courseId) where.courseId = courseId;
  if (userId)   where.userId   = userId;

  try {
    const grades = await prisma.grade.findMany({
      where,
      include: {
        user:   { select: { id: true, name: true, email: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { grades } });
  } catch (err) {
    console.error('[getTeacherGrades]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/grades/gradebook?courseId=
const getGradebook = async (req, res) => {
  const { courseId } = req.query;
  if (!courseId) return res.status(422).json({ success: false, message: 'courseId is required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const grades = await prisma.grade.findMany({
      where: { courseId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ userId: 'asc' }, { createdAt: 'desc' }],
    });

    const gradebook = grades.reduce((acc, grade) => {
      if (!acc[grade.userId]) acc[grade.userId] = { user: grade.user, grades: [], average: 0 };
      acc[grade.userId].grades.push({
        id: grade.id,
        title: grade.title,
        score: grade.score,
        maxScore: grade.maxScore,
        type: grade.type,
        createdAt: grade.createdAt,
      });
      return acc;
    }, {});

    Object.values(gradebook).forEach((entry) => {
      const total = entry.grades.reduce((s, g) => s + (g.score / g.maxScore) * 100, 0);
      entry.average = entry.grades.length > 0 ? Math.round(total / entry.grades.length) : 0;
    });

    return res.status(200).json({ success: true, data: { gradebook: Object.values(gradebook) } });
  } catch (err) {
    console.error('[getGradebook]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/teacher/grades
const createGrade = async (req, res) => {
  const { userId, courseId, title, score, maxScore, type } = req.body;
  if (!userId || !courseId || !title || score === undefined)
    return res.status(422).json({ success: false, message: 'userId, courseId, title, and score are required' });

  try {
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: req.user.id },
    });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const grade = await prisma.grade.create({
      data: { userId, courseId, title, score, maxScore: maxScore ?? 100, type: type ?? 'assignment' },
      include: {
        user:   { select: { id: true, name: true } },
        course: { select: { id: true, title: true } },
      },
    });
    return res.status(201).json({ success: true, message: 'Grade recorded', data: { grade } });
  } catch (err) {
    console.error('[createGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/teacher/grades/:id
const updateGrade = async (req, res) => {
  try {
    const grade = await prisma.grade.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });

    const { score, title, maxScore } = req.body;
    const data = {};
    if (score !== undefined)    data.score    = score;
    if (title !== undefined)    data.title    = title;
    if (maxScore !== undefined) data.maxScore = maxScore;

    const updated = await prisma.grade.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Grade updated', data: { grade: updated } });
  } catch (err) {
    console.error('[updateGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/teacher/grades/:id
const deleteGrade = async (req, res) => {
  try {
    const grade = await prisma.grade.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found' });
    await prisma.grade.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Grade deleted' });
  } catch (err) {
    console.error('[deleteGrade]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Student Progress View ────────────────────────────────────────────────────

// GET /api/teacher/students/:userId/progress?courseId=
const getStudentProgress = async (req, res) => {
  const { courseId } = req.query;
  const { userId } = req.params;

  try {
    if (courseId) {
      const course = await prisma.course.findFirst({
        where: { id: courseId, teacherId: req.user.id },
      });
      if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    }

    const [progress, submissions, quizAttempts, attendance] = await Promise.all([
      prisma.progress.findMany({
        where: {
          userId,
          ...(courseId ? { lesson: { module: { courseId } } } : {}),
        },
        include: {
          lesson: { select: { id: true, title: true, order: true } },
          module: { select: { id: true, title: true } },
        },
      }),
      prisma.submission.findMany({
        where: {
          userId,
          ...(courseId ? { assignment: { courseId } } : { assignment: { course: { teacherId: req.user.id } } }),
        },
        include: {
          assignment: { select: { id: true, title: true, maxScore: true, dueDate: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.quizAttempt.findMany({
        where: {
          userId,
          ...(courseId ? { quiz: { courseId } } : { quiz: { course: { teacherId: req.user.id } } }),
        },
        include: {
          quiz: { select: { id: true, title: true, passingScore: true } },
        },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.attendance.findMany({
        where: {
          userId,
          ...(courseId ? { courseId } : { course: { teacherId: req.user.id } }),
        },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { date: 'desc' },
      }),
    ]);

    const completedLessons = progress.filter((p) => p.completed).length;
    const totalLessons     = progress.length;
    const attendancePct    = attendance.length > 0
      ? Math.round(
          (attendance.filter((a) => a.status === 'PRESENT' || a.status === 'LATE').length /
            attendance.length) *
            100
        )
      : 0;

    return res.status(200).json({
      success: true,
      data: {
        progress,
        submissions,
        quizAttempts,
        attendance,
        summary: {
          completedLessons,
          totalLessons,
          completionPercentage: totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0,
          attendancePercentage: attendancePct,
          submissionsCount:     submissions.length,
          gradedCount:          submissions.filter((s) => s.status === 'GRADED').length,
          quizzesTaken:         quizAttempts.length,
          quizzesPassed:        quizAttempts.filter((a) => a.passed).length,
        },
      },
    });
  } catch (err) {
    console.error('[getStudentProgress]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/teacher/students  — all students across teacher's courses
const getAllTeacherStudents = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { search } = req.query;

  try {
    const enrollmentWhere = { course: { teacherId: req.user.id } };
    if (search) {
      enrollmentWhere.user = {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const enrollments = await prisma.enrollment.findMany({
      where: enrollmentWhere,
      include: {
        user:   { select: { id: true, name: true, email: true, avatar: true, createdAt: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { enrolledAt: 'desc' },
      skip,
      take: limit,
    });

    const total = await prisma.enrollment.count({ where: enrollmentWhere });

    // Deduplicate by student, list their courses
    const studentMap = enrollments.reduce((acc, e) => {
      if (!acc[e.userId]) acc[e.userId] = { ...e.user, courses: [], enrolledAt: e.enrolledAt };
      acc[e.userId].courses.push(e.course);
      return acc;
    }, {});

    return res.status(200).json({
      success: true,
      ...paginatedResponse(Object.values(studentMap), total, page, limit),
    });
  } catch (err) {
    console.error('[getAllTeacherStudents]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ─── Quiz Attempts (view results) ─────────────────────────────────────────────

// GET /api/teacher/quizzes/:id/attempts
const getQuizAttempts = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  try {
    const quiz = await prisma.quiz.findFirst({
      where: { id: req.params.id, course: { teacherId: req.user.id } },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });

    const [attempts, total] = await Promise.all([
      prisma.quizAttempt.findMany({
        where: { quizId: req.params.id },
        skip,
        take: limit,
        include: {
          user:    { select: { id: true, name: true, email: true, avatar: true } },
          answers: true,
        },
        orderBy: { startedAt: 'desc' },
      }),
      prisma.quizAttempt.count({ where: { quizId: req.params.id } }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(attempts, total, page, limit) });
  } catch (err) {
    console.error('[getQuizAttempts]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = {
  // Dashboard
  getTeacherDashboard,
  // Courses
  getTeacherCourses, getTeacherCourseById, createTeacherCourse, updateTeacherCourse,
  deleteTeacherCourse, toggleCoursePublish,
  // Students
  getCourseStudents, removeStudentFromCourse, getAllTeacherStudents, getStudentProgress,
  // Modules
  getCourseModules, createCourseModule, updateModule, deleteModule, reorderModules,
  // Lessons
  getModuleLessons, createLesson, updateLesson, deleteLesson, reorderLessons,
  // Assignments
  getTeacherAssignments, getTeacherAssignmentById, createAssignment, updateAssignment, deleteAssignment,
  // Submissions
  getTeacherSubmissions, getSubmissionById, gradeSubmission, bulkGradeSubmissions,
  // Quizzes
  getTeacherQuizzes, getTeacherQuizById, createQuiz, updateQuiz, deleteQuiz, toggleQuizStatus,
  // Questions
  getQuizQuestions, addQuestion, bulkAddQuestions, updateQuestion, deleteQuestion, getQuizAttempts,
  // Attendance
  getTeacherAttendance, markAttendance, markBulkAttendance, getAttendanceSummary,
  // Announcements
  getTeacherAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  // Grades
  getTeacherGrades, getGradebook, createGrade, updateGrade, deleteGrade,
};
const prisma = require('../config/prisma');

// GET /api/progress?courseId=xxx
const getProgress = async (req, res) => {
  const { courseId } = req.query;
  const userId = req.user.id;

  try {
    let where = { userId, completed: true };

    if (courseId) {
      const lessons = await prisma.lesson.findMany({
        where: { module: { courseId }, isPublished: true },
        select: { id: true },
      });
      if (lessons.length === 0) {
        return res.status(200).json({ success: true, data: { progress: [] } });
      }
      where.lessonId = { in: lessons.map(l => l.id) };
    }

    const progress = await prisma.progress.findMany({
      where,
      select: { lessonId: true, completed: true },
    });

    return res.status(200).json({ success: true, data: { progress } });
  } catch (err) {
    console.error('[getProgress]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/progress/lesson/:lessonId/complete
const markLessonComplete = async (req, res) => {
  const userId = req.user.id;
  const { lessonId } = req.params;

  try {
    const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found' });

    // upsert is now safe because lessonId is non-nullable in the fixed schema
    const progress = await prisma.progress.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      update: { completed: true, completedAt: new Date() },
      create: { userId, lessonId, completed: true, completedAt: new Date() },
      select: { lessonId: true, completed: true },
    });

    return res.status(200).json({ success: true, data: { progress } });
  } catch (err) {
    console.error('[markLessonComplete]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/progress/lesson/:lessonId/complete
const unmarkLessonComplete = async (req, res) => {
  const userId = req.user.id;
  const { lessonId } = req.params;

  try {
    const existing = await prisma.progress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
    });

    if (!existing) {
      return res.status(200).json({ success: true, message: 'Already unmarked' });
    }

    const updated = await prisma.progress.update({
      where: { userId_lessonId: { userId, lessonId } },
      data: { completed: false, completedAt: null },
      select: { lessonId: true, completed: true },
    });

    return res.status(200).json({ success: true, data: { progress: updated } });
  } catch (err) {
    console.error('[unmarkLessonComplete]', err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/progress/course/:courseId  ← replace existing getCourseSummary
const getCourseSummary = async (req, res) => {
  const { courseId } = req.params;
  const userId = req.user.id;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          where: { isPublished: true },
          orderBy: { order: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { order: 'asc' },
              select: { id: true, title: true },
            },
          },
        },
      },
    });

    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

    const allLessonIds = course.modules.flatMap(m => m.lessons.map(l => l.id));
    const total = allLessonIds.length;

    const completedRecords = total === 0 ? [] : await prisma.progress.findMany({
      where: { userId, lessonId: { in: allLessonIds }, completed: true },
      select: { lessonId: true },
    });
    const completedSet = new Set(completedRecords.map(r => r.lessonId));

    const modules = course.modules.map(m => ({
      moduleId: m.id,
      title: m.title,
      lessons: m.lessons.map(l => ({
        lessonId: l.id,
        title: l.title,
        completed: completedSet.has(l.id),
      })),
    }));

    return res.status(200).json({
      success: true,
      data: {
        courseId,
        totalLessons: total,
        completedLessons: completedSet.size,
        percentage: total > 0 ? Math.round((completedSet.size / total) * 100) : 0,
        modules, // ← now included
      },
    });
  } catch (err) {
    console.error('[getCourseSummary]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/progress/summary
const getAllCoursesSummary = async (req, res) => {
  const userId = req.user.id;

  try {
    const enrollments = await prisma.enrollment.findMany({
      where: { userId },
      include: {
        course: {
          select: {
            id: true, title: true,
            modules: {
              select: {
                lessons: { where: { isPublished: true }, select: { id: true } },
              },
            },
          },
        },
      },
    });

    const summaries = await Promise.all(
      enrollments.map(async ({ course }) => {
        const lessonIds = course.modules.flatMap(m => m.lessons.map(l => l.id));
        const total = lessonIds.length;
        const completed = total === 0 ? 0 : await prisma.progress.count({
          where: { userId, lessonId: { in: lessonIds }, completed: true },
        });
        return {
          courseId: course.id,
          title: course.title,
          totalLessons: total,
          completedLessons: completed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      })
    );

    return res.status(200).json({ success: true, data: { summaries } });
  } catch (err) {
    console.error('[getAllCoursesSummary]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getProgress, markLessonComplete, unmarkLessonComplete, getCourseSummary, getAllCoursesSummary };
const prisma = require('../config/prisma');

const getStudentDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const [enrollments, submissions, quizAttempts, unreadNotifications] = await Promise.all([
      prisma.enrollment.count({ where: { userId } }),
      prisma.submission.count({ where: { userId } }),
      prisma.quizAttempt.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);
    const [recentSubmissions, upcomingAssignments, recentCourses] = await Promise.all([
      prisma.submission.findMany({
        where: { userId },
        include: { assignment: { select: { id: true, title: true, maxScore: true } } },
        orderBy: { submittedAt: 'desc' },
        take: 5,
      }),
      prisma.assignment.findMany({
        where: {
          isPublished: true,
          dueDate: { gte: new Date() },
          course: { enrollments: { some: { userId } } },
        },
        include: { course: { select: { id: true, title: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      prisma.enrollment.findMany({
        where: { userId },
        include: {
          course: {
            select: {
              id: true, title: true, thumbnail: true,
              teacher: { select: { id: true, name: true } },
              _count: { select: { modules: true } },
            },
          },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 5,
      }),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        stats: { enrollments, submissions, quizAttempts, unreadNotifications },
        recentSubmissions,
        upcomingAssignments,
        recentCourses: recentCourses.map(e => e.course),
      },
    });
  } catch (err) {
    console.error('[getStudentDashboard]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getTeacherDashboard = async (req, res) => {
  try {
    const teacherId = req.user.id;
    const [courses, totalStudents, pendingSubmissions, unreadNotifications] = await Promise.all([
      prisma.course.count({ where: { teacherId } }),
      prisma.enrollment.count({ where: { course: { teacherId } } }),
      prisma.submission.count({ where: { status: 'SUBMITTED', assignment: { course: { teacherId } } } }),
      prisma.notification.count({ where: { userId: teacherId, isRead: false } }),
    ]);
    const [recentEnrollments, pendingGrading, recentCourses] = await Promise.all([
      prisma.enrollment.findMany({
        where: { course: { teacherId } },
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          course: { select: { id: true, title: true } },
        },
        orderBy: { enrolledAt: 'desc' },
        take: 5,
      }),
      prisma.submission.findMany({
        where: { status: 'SUBMITTED', assignment: { course: { teacherId } } },
        include: {
          user: { select: { id: true, name: true } },
          assignment: { select: { id: true, title: true, course: { select: { id: true, title: true } } } },
        },
        orderBy: { submittedAt: 'asc' },
        take: 5,
      }),
      prisma.course.findMany({
        where: { teacherId },
        include: { _count: { select: { enrollments: true, modules: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        stats: { courses, totalStudents, pendingSubmissions, unreadNotifications },
        recentEnrollments,
        pendingGrading,
        recentCourses,
      },
    });
  } catch (err) {
    console.error('[getTeacherDashboard]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAdminDashboard = async (req, res) => {
  try {
    const [totalUsers, totalCourses, totalEnrollments, totalSubmissions] = await Promise.all([
      prisma.user.count(),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.submission.count(),
    ]);
    const [usersByRole, recentUsers, recentCourses] = await Promise.all([
      prisma.user.groupBy({ by: ['role'], _count: { id: true } }),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      prisma.course.findMany({
        include: {
          teacher: { select: { id: true, name: true } },
          _count: { select: { enrollments: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    return res.status(200).json({
      success: true,
      data: {
        stats: { totalUsers, totalCourses, totalEnrollments, totalSubmissions },
        usersByRole: usersByRole.map(r => ({ role: r.role, count: r._count.id })),
        recentUsers,
        recentCourses,
      },
    });
  } catch (err) {
    console.error('[getAdminDashboard]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getStudentDashboard, getTeacherDashboard, getAdminDashboard };
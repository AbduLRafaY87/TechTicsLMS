const prisma = require('../config/prisma');

const getAttendance = async (req, res) => {
  const { courseId, userId, date } = req.query;
  const where = {};
  if (courseId) where.courseId = courseId;
  if (req.user.role === 'STUDENT') where.userId = req.user.id;
  else if (userId) where.userId = userId;
  if (date) where.date = { gte: new Date(date) };
  try {
    const attendance = await prisma.attendance.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, avatar: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { date: 'desc' },
    });
    return res.status(200).json({ success: true, data: { attendance } });
  } catch (err) {
    console.error('[getAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markAttendance = async (req, res) => {
  const { userId, courseId, status, note, date } = req.body;
  if (!userId || !courseId)
    return res.status(422).json({ success: false, message: 'userId and courseId are required' });
  try {
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

const markBulkAttendance = async (req, res) => {
  const { courseId, date, records } = req.body;
  // records: [{ userId, status, note }]
  if (!courseId || !Array.isArray(records) || records.length === 0)
    return res.status(422).json({ success: false, message: 'courseId and records array are required' });
  try {
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
    const saved = results.filter(r => r.status === 'fulfilled').length;
    return res.status(201).json({ success: true, message: `${saved}/${records.length} records saved` });
  } catch (err) {
    console.error('[markBulkAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateAttendance = async (req, res) => {
  try {
    const { status, note } = req.body;
    const data = {};
    if (status !== undefined) data.status = status;
    if (note !== undefined) data.note = note;
    const updated = await prisma.attendance.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Attendance updated', data: { attendance: updated } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'Record not found' });
    console.error('[updateAttendance]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAttendanceSummary = async (req, res) => {
  const { courseId, userId } = req.query;
  if (!courseId) return res.status(422).json({ success: false, message: 'courseId is required' });
  const targetUserId = req.user.role === 'STUDENT' ? req.user.id : userId;
  try {
    const records = await prisma.attendance.findMany({
      where: { courseId, ...(targetUserId ? { userId: targetUserId } : {}) },
      select: { status: true },
    });
    const summary = records.reduce((acc, { status }) => {
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {});
    const total = records.length;
    const present = (summary.PRESENT || 0) + (summary.LATE || 0);
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return res.status(200).json({ success: true, data: { summary, total, attendancePercentage: percentage } });
  } catch (err) {
    console.error('[getAttendanceSummary]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAttendance, markAttendance, markBulkAttendance, updateAttendance, getAttendanceSummary };
const prisma = require('../config/prisma');
const { createBulkNotifications } = require('../utils/notifications');

const getAnnouncements = async (req, res) => {
  const { courseId } = req.query;
  const where = courseId ? { courseId } : {};
  try {
    const announcements = await prisma.announcement.findMany({
      where,
      include: { course: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { announcements } });
  } catch (err) {
    console.error('[getAnnouncements]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getAnnouncementById = async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { id: true, title: true } } },
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    return res.status(200).json({ success: true, data: { announcement } });
  } catch (err) {
    console.error('[getAnnouncementById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createAnnouncement = async (req, res) => {
  const { courseId, title, content } = req.body;
  if (!courseId || !title || !content)
    return res.status(422).json({ success: false, message: 'courseId, title, and content are required' });
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role !== 'ADMIN' && course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const announcement = await prisma.announcement.create({ data: { courseId, title, content } });
    const enrollments = await prisma.enrollment.findMany({ where: { courseId }, select: { userId: true } });
    await createBulkNotifications(
      enrollments.map(e => e.userId),
      `Announcement: ${title}`,
      `New announcement in ${course.title}`,
      'info',
      `/courses/${courseId}`
    );
    return res.status(201).json({ success: true, message: 'Announcement created', data: { announcement } });
  } catch (err) {
    console.error('[createAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateAnnouncement = async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
      include: { course: true },
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (req.user.role !== 'ADMIN' && announcement.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const { title, content } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;
    const updated = await prisma.announcement.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Announcement updated', data: { announcement: updated } });
  } catch (err) {
    console.error('[updateAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await prisma.announcement.findUnique({
      where: { id: req.params.id },
      include: { course: true },
    });
    if (!announcement) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (req.user.role !== 'ADMIN' && announcement.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.announcement.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    console.error('[deleteAnnouncement]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement };
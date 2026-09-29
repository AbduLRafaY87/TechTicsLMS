const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');

const getNotifications = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { unread } = req.query;
  const where = { userId: req.user.id };
  if (unread === 'true') where.isRead = false;
  try {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.notification.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(notifications, total, page, limit) });
  } catch (err) {
    console.error('[getNotifications]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markAsRead = async (req, res) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Forbidden' });
    const updated = await prisma.notification.update({ where: { id: req.params.id }, data: { isRead: true } });
    return res.status(200).json({ success: true, message: 'Marked as read', data: { notification: updated } });
  } catch (err) {
    console.error('[markAsRead]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const markAllAsRead = async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('[markAllAsRead]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const notification = await prisma.notification.findUnique({ where: { id: req.params.id } });
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    if (notification.userId !== req.user.id) return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.notification.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    console.error('[deleteNotification]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getNotifications, markAsRead, markAllAsRead, deleteNotification };
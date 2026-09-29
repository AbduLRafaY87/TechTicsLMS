const prisma = require('../config/prisma');

const createNotification = async (userId, title, message, type = 'info', link = null) => {
  try {
    await prisma.notification.create({ data: { userId, title, message, type, link } });
  } catch (err) {
    console.error('[createNotification]', err);
  }
};

const createBulkNotifications = async (userIds, title, message, type = 'info', link = null) => {
  try {
    await prisma.notification.createMany({
      data: userIds.map((userId) => ({ userId, title, message, type, link })),
    });
  } catch (err) {
    console.error('[createBulkNotifications]', err);
  }
};

module.exports = { createNotification, createBulkNotifications };
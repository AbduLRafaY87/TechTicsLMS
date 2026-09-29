const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');

const getMessages = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { type } = req.query;
  const where = type === 'sent' ? { senderId: req.user.id } : { receiverId: req.user.id };
  try {
    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where, skip, take: limit,
        include: {
          sender: { select: { id: true, name: true, avatar: true } },
          receiver: { select: { id: true, name: true, avatar: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.message.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(messages, total, page, limit) });
  } catch (err) {
    console.error('[getMessages]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getMessageById = async (req, res) => {
  try {
    const message = await prisma.message.findUnique({
      where: { id: req.params.id },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
      },
    });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (message.senderId !== req.user.id && message.receiverId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    if (message.receiverId === req.user.id && !message.isRead)
      await prisma.message.update({ where: { id: req.params.id }, data: { isRead: true } });
    return res.status(200).json({ success: true, data: { message } });
  } catch (err) {
    console.error('[getMessageById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const sendMessage = async (req, res) => {
  const { receiverId, subject, content } = req.body;
  if (!receiverId || !content)
    return res.status(422).json({ success: false, message: 'receiverId and content are required' });
  if (receiverId === req.user.id)
    return res.status(400).json({ success: false, message: 'Cannot send message to yourself' });
  try {
    const receiver = await prisma.user.findUnique({ where: { id: receiverId } });
    if (!receiver) return res.status(404).json({ success: false, message: 'Receiver not found' });
    const message = await prisma.message.create({
      data: { senderId: req.user.id, receiverId, subject, content },
      include: {
        sender: { select: { id: true, name: true, avatar: true } },
        receiver: { select: { id: true, name: true, avatar: true } },
      },
    });
    return res.status(201).json({ success: true, message: 'Message sent', data: { message } });
  } catch (err) {
    console.error('[sendMessage]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteMessage = async (req, res) => {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (message.senderId !== req.user.id && message.receiverId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.message.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Message deleted' });
  } catch (err) {
    console.error('[deleteMessage]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getMessages, getMessageById, sendMessage, deleteMessage };
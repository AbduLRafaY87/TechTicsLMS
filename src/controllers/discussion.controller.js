const prisma = require('../config/prisma');
const { paginate } = require('../utils/helpers');
const fs   = require('fs');
const path = require('path');

const uploadsDir = path.join(process.cwd(), 'uploads', 'discussions');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Strip trailing /api if present, we just need the origin
const getBaseUrl = () => {
  const url = process.env.BASE_URL || 'http://localhost:5000';
  return url.replace(/\/api$/, '').replace(/\/$/, '');
};

const normalizeReply = (r) => ({
  id:           r.id,
  content:      r.content || '',
  imageUrl:     r.imageUrl     ? `${getBaseUrl()}/${r.imageUrl}`     : null,
  voiceNoteUrl: r.voiceNoteUrl ? `${getBaseUrl()}/${r.voiceNoteUrl}` : null,
  createdAt:    r.createdAt,
  likes:        0,
  likedByMe:    false,
  isAccepted:   false,
  author: { id: r.user.id, name: r.user.name, role: r.user.role },
});

const getDiscussions = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const userId = req.user.id;

  try {
    let courseIds = [];

    if (req.user.role === 'STUDENT') {
      const enrollments = await prisma.enrollment.findMany({
        where: { userId },
        select: { courseId: true },
      });
      courseIds = enrollments.map(e => e.courseId);
    } else {
      const courses = await prisma.course.findMany({
        where: { teacherId: userId },
        select: { id: true },
      });
      courseIds = courses.map(c => c.id);
    }

    if (courseIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          summary: { total: 0, open: 0, answered: 0, myThreads: 0, totalReplies: 0 },
          threads: [],
        },
      });
    }

    const where = { courseId: { in: courseIds } };

    const [discussions, total] = await Promise.all([
      prisma.discussion.findMany({
        where, skip, take: limit,
        include: {
          user:    { select: { id: true, name: true, role: true } },
          course:  { select: { id: true, title: true } },
          replies: {
            include: { user: { select: { id: true, name: true, role: true } } },
            orderBy: { createdAt: 'asc' },
          },
          _count: { select: { replies: true } },
        },
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.discussion.count({ where }),
    ]);

    const threads = discussions.map(d => ({
      id:         d.id,
      title:      d.title,
      content:    d.content,
      isPinned:   d.isPinned,
      status:     d.isPinned ? 'pinned' : 'open',
      tag:        (d.category ?? 'GENERAL').toLowerCase(),
      views:      0,
      replyCount: d._count.replies,
      createdAt:  d.createdAt,
      updatedAt:  d.updatedAt,
      course:  { id: d.course.id,  title: d.course.title },
      author:  { id: d.user.id,    name: d.user.name, role: d.user.role },
      replies: d.replies.map(r => normalizeReply(r)),
    }));

    const myThreads    = discussions.filter(d => d.userId === userId).length;
    const totalReplies = discussions.reduce((s, d) => s + d._count.replies, 0);

    return res.status(200).json({
      success: true,
      data: {
        summary: { total, open: total, answered: 0, myThreads, totalReplies },
        threads,
      },
    });
  } catch (err) {
    console.error('[getDiscussions]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getDiscussionById = async (req, res) => {
  try {
    const discussion = await prisma.discussion.findUnique({
      where: { id: req.params.id },
      include: {
        user:    { select: { id: true, name: true, role: true } },
        replies: {
          include: { user: { select: { id: true, name: true, role: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });
    return res.status(200).json({ success: true, data: { discussion } });
  } catch (err) {
    console.error('[getDiscussionById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createDiscussion = async (req, res) => {
  const { courseId, title, content, category } = req.body;
  if (!courseId || !title || !content)
    return res.status(422).json({ success: false, message: 'courseId, title, and content are required' });
  try {
    const discussion = await prisma.discussion.create({
      data: { courseId, userId: req.user.id, title, content, category: category?.toUpperCase() ?? 'GENERAL' },
      include: {
        user:   { select: { id: true, name: true, role: true } },
        course: { select: { id: true, title: true } },
        _count: { select: { replies: true } },
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Discussion created',
      data: {
        discussion: {
          id:         discussion.id,
          title:      discussion.title,
          content:    discussion.content,
          isPinned:   discussion.isPinned,
          status:     discussion.isPinned ? 'pinned' : 'open',
          tag:        (discussion.category ?? 'GENERAL').toLowerCase(),
          views:      0,
          replyCount: 0,
          replies:    [],
          createdAt:  discussion.createdAt,
          updatedAt:  discussion.updatedAt,
          course:  { id: discussion.course.id,  title: discussion.course.title },
          author:  { id: discussion.user.id,    name: discussion.user.name, role: discussion.user.role },
        },
      },
    });
  } catch (err) {
    console.error('[createDiscussion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateDiscussion = async (req, res) => {
  try {
    const discussion = await prisma.discussion.findUnique({ where: { id: req.params.id } });
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });
    if (req.user.role !== 'ADMIN' && discussion.userId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    const { title, content, isPinned, category } = req.body;
    const data = {};
    if (title    !== undefined) data.title    = title;
    if (content  !== undefined) data.content  = content;
    if (category !== undefined) data.category = category.toUpperCase();
    if (isPinned !== undefined && req.user.role !== 'STUDENT') data.isPinned = isPinned;

    const updated = await prisma.discussion.update({
      where: { id: req.params.id },
      data,
      include: {
        user:   { select: { id: true, name: true, role: true } },
        course: { select: { id: true, title: true } },
        _count: { select: { replies: true } },
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Discussion updated',
      data: {
        discussion: {
          id:         updated.id,
          title:      updated.title,
          content:    updated.content,
          isPinned:   updated.isPinned,
          status:     updated.isPinned ? 'pinned' : 'open',
          tag:        (updated.category ?? 'GENERAL').toLowerCase(),
          views:      0,
          replyCount: updated._count.replies,
          createdAt:  updated.createdAt,
          updatedAt:  updated.updatedAt,
          course:  { id: updated.course.id,  title: updated.course.title },
          author:  { id: updated.user.id,    name: updated.user.name, role: updated.user.role },
        },
      },
    });
  } catch (err) {
    console.error('[updateDiscussion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteDiscussion = async (req, res) => {
  try {
    const discussion = await prisma.discussion.findUnique({ where: { id: req.params.id } });
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });
    if (req.user.role !== 'ADMIN' && discussion.userId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.discussion.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Discussion deleted' });
  } catch (err) {
    console.error('[deleteDiscussion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addReply = async (req, res) => {
  const { content } = req.body;
  const file = req.file;

  if (!content && !file)
    return res.status(422).json({ success: false, message: 'content or attachment is required' });

  try {
    const discussion = await prisma.discussion.findUnique({ where: { id: req.params.id } });
    if (!discussion) return res.status(404).json({ success: false, message: 'Discussion not found' });

    const isVoice = file && file.mimetype.startsWith('audio/');
    const isImage = file && file.mimetype.startsWith('image/');

    // Store relative path only — never store full URLs in DB
    const reply = await prisma.discussionReply.create({
      data: {
        discussionId: req.params.id,
        userId:       req.user.id,
        content:      content || '',
        imageUrl:     isImage ? `uploads/discussions/${file.filename}` : null,
        voiceNoteUrl: isVoice ? `uploads/discussions/${file.filename}` : null,
      },
      include: { user: { select: { id: true, name: true, role: true } } },
    });

    const normalized = normalizeReply(reply);

    // Emit to all clients in this thread room (including sender)
    const io = req.app.get('io');
    io.to(`thread:${req.params.id}`).emit('new_reply', {
      threadId: req.params.id,
      reply:    normalized,
    });

    return res.status(201).json({ success: true, message: 'Reply added', data: { reply: normalized } });
  } catch (err) {
    console.error('[addReply]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteReply = async (req, res) => {
  try {
    const reply = await prisma.discussionReply.findUnique({ where: { id: req.params.replyId } });
    if (!reply) return res.status(404).json({ success: false, message: 'Reply not found' });
    if (req.user.role !== 'ADMIN' && reply.userId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });

    if (reply.imageUrl)     { try { fs.unlinkSync(path.join(process.cwd(), reply.imageUrl));     } catch {} }
    if (reply.voiceNoteUrl) { try { fs.unlinkSync(path.join(process.cwd(), reply.voiceNoteUrl)); } catch {} }

    await prisma.discussionReply.delete({ where: { id: req.params.replyId } });
    return res.status(200).json({ success: true, message: 'Reply deleted' });
  } catch (err) {
    console.error('[deleteReply]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getDiscussions, getDiscussionById, createDiscussion, updateDiscussion, deleteDiscussion, addReply, deleteReply };
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');
const prisma = require('../config/prisma');
const { paginate, paginatedResponse } = require('../utils/helpers');

// GET /api/users  (ADMIN only)
const getAllUsers = async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const { role, search } = req.query;

  const where = {};
  if (role) where.role = role;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, skip, take: limit,
        select: {
          id: true, name: true, email: true, role: true, avatar: true, createdAt: true,
          _count: { select: { enrollments: true, taughtCourses: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);
    return res.status(200).json({ success: true, ...paginatedResponse(users, total, page, limit) });
  } catch (err) {
    console.error('[getAllUsers]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/users/:id
const getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, bio: true, phone: true, createdAt: true,
        taughtCourses: { select: { id: true, title: true, _count: { select: { enrollments: true } } } },
        enrollments: { include: { course: { select: { id: true, title: true, thumbnail: true, teacher: { select: { name: true } } } } } },
        _count: { select: { enrollments: true, taughtCourses: true, submissions: true } },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    console.error('[getUserById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// PATCH /api/users/:id
const updateUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { id } = req.params;
  if (req.user.role !== 'ADMIN' && req.user.id !== id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { name, password, avatar, bio, phone } = req.body;
  const data = {};
  if (name)   data.name   = name.trim();
  if (avatar) data.avatar = avatar;
  if (bio !== undefined) data.bio = bio;
  if (phone !== undefined) data.phone = phone;
  if (password) data.password = await bcrypt.hash(password, 12);

  try {
    const user = await prisma.user.update({
      where: { id },
      data,
      select: { id: true, name: true, email: true, role: true, avatar: true, bio: true, phone: true, updatedAt: true },
    });
    return res.status(200).json({ success: true, message: 'User updated', data: { user } });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'User not found' });
    console.error('[updateUser]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/users/:id  (ADMIN only)
const deleteUser = async (req, res) => {
  if (req.user.id === req.params.id) {
    return res.status(400).json({ success: false, message: 'Cannot delete your own account via this endpoint' });
  }
  try {
    await prisma.user.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'User deleted' });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ success: false, message: 'User not found' });
    console.error('[deleteUser]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// DELETE /api/users/me  (self-delete)
const deleteMe = async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: req.user.id } });
    return res.status(200).json({ success: true, message: 'Account deleted' });
  } catch (err) {
    console.error('[deleteMe]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getAllUsers, getUserById, updateUser, deleteUser, deleteMe };
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const prisma = require('../config/prisma');

const generateToken = (user) =>
  jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

// POST /api/auth/register
const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { name, email, password, role } = req.body;
  try {
    if (await prisma.user.findUnique({ where: { email } })) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    const user = await prisma.user.create({
      data: { name, email, password: await bcrypt.hash(password, 12), role: role ?? 'STUDENT' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    });
    return res.status(201).json({ success: true, message: 'Account created', data: { user, token: generateToken(user) } });
  } catch (err) {
    console.error('[register]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const { password: _, ...safeUser } = user;
    return res.status(200).json({ success: true, message: 'Login successful', data: { user: safeUser, token: generateToken(user) } });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// GET /api/auth/me
const me = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, name: true, email: true, role: true, avatar: true, bio: true, phone: true,
        createdAt: true, updatedAt: true,
        taughtCourses: { select: { id: true, title: true } },
        enrollments: {
          include: {
            course: {
              select: { id: true, title: true, description: true, thumbnail: true,
                teacher: { select: { id: true, name: true } }, _count: { select: { enrollments: true } } }
            }
          }
        },
      },
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.status(200).json({ success: true, data: { user } });
  } catch (err) {
    console.error('[me]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(422).json({ success: false, message: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(422).json({ success: false, message: 'New password must be at least 6 characters' });
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!await bcrypt.compare(currentPassword, user.password)) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }
    await prisma.user.update({
      where: { id: req.user.id },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });
    return res.status(200).json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    console.error('[changePassword]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { register, login, me, changePassword };
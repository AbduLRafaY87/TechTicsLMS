require('dotenv').config();
const express        = require('express');
const cors           = require('cors');
const helmet         = require('helmet');
const morgan         = require('morgan');
const compression    = require('compression');
const rateLimit      = require('express-rate-limit');

const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const courseRoutes       = require('./routes/course.routes');
const moduleRoutes       = require('./routes/module.routes');
const lessonRoutes       = require('./routes/lesson.routes');
const assignmentRoutes   = require('./routes/assignment.routes');
const submissionRoutes   = require('./routes/submission.routes');
const quizRoutes         = require('./routes/quiz.routes');
const attendanceRoutes   = require('./routes/attendance.routes');
const discussionRoutes   = require('./routes/discussion.routes');
const announcementRoutes = require('./routes/announcement.routes');
const notificationRoutes = require('./routes/notification.routes');
const messageRoutes      = require('./routes/message.routes');
const gradeRoutes        = require('./routes/grade.routes');
const progressRoutes     = require('./routes/progress.routes');
const dashboardRoutes    = require('./routes/dashboard.routes');
const teacherRoutes      = require('./routes/teacher.routes');
const uploadRoutes       = require('./routes/upload.routes');

const app = express();

// ─── Security & Utility Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});

app.use('/api', globalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/courses',       courseRoutes);
app.use('/api/modules',       moduleRoutes);
app.use('/api/lessons',       lessonRoutes);
app.use('/api/assignments',   assignmentRoutes);
app.use('/api/submissions',   submissionRoutes);
app.use('/api/quizzes',       quizRoutes);
app.use('/api/attendance',    attendanceRoutes);
app.use('/api/discussions',   discussionRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages',      messageRoutes);
app.use('/api/grades',        gradeRoutes);
app.use('/api/progress',      progressRoutes);
app.use('/api/dashboard',     dashboardRoutes);
app.use('/api/teacher',       teacherRoutes);
app.use('/api/upload',        uploadRoutes);

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({
  status: 'ok',
  version: '2.0.0',
  timestamp: new Date().toISOString(),
  environment: process.env.NODE_ENV || 'development',
}));

// ─── Static uploads ───────────────────────────────────────────────────────────
app.use('/uploads', express.static('uploads'));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.originalUrl}` }));

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[unhandled error]', err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error' });
});

module.exports = app;
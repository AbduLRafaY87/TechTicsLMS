const { Router } = require('express');
const { getStudentDashboard, getTeacherDashboard, getAdminDashboard } = require('../controllers/dashboard.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();
router.use(authenticate);

router.get('/student', authorize('STUDENT'), getStudentDashboard);
router.get('/teacher', authorize('TEACHER'), getTeacherDashboard);
router.get('/admin', authorize('ADMIN'), getAdminDashboard);

router.get('/', (req, res) => {
  const role = req.user.role;
  if (role === 'STUDENT') return res.redirect('/api/dashboard/student');
  if (role === 'TEACHER') return res.redirect('/api/dashboard/teacher');
  if (role === 'ADMIN') return res.redirect('/api/dashboard/admin');
  return res.status(400).json({ success: false, message: 'Unknown role' });
});

module.exports = router;
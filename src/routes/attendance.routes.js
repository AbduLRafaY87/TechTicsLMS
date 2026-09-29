const { Router } = require('express');
const { getAttendance, markAttendance, markBulkAttendance, updateAttendance, getAttendanceSummary } = require('../controllers/attendance.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();
router.use(authenticate);

router.get('/', getAttendance);
router.get('/summary', getAttendanceSummary);
router.post('/', authorize('ADMIN', 'TEACHER'), markAttendance);
router.post('/bulk', authorize('ADMIN', 'TEACHER'), markBulkAttendance);
router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateAttendance);

module.exports = router;
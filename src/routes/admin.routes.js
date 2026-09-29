const { Router } = require('express');
const {
  getEnrollmentRequests,
  getEnrollmentRequestStats,
  deleteEnrollmentRequest,
  approveEnrollmentRequest,
  rejectEnrollmentRequest,
} = require('../controllers/admin.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();

router.use(authenticate, authorize('ADMIN'));
router.get('/enrollment-requests/stats', getEnrollmentRequestStats);
router.get('/enrollment-requests', getEnrollmentRequests);
router.patch('/enrollment-requests/:id/approve', approveEnrollmentRequest);
router.patch('/enrollment-requests/:id/reject', rejectEnrollmentRequest);
router.delete('/enrollment-requests/:id', deleteEnrollmentRequest);

module.exports = router;
const { Router } = require('express');
const { getSubmissions, getSubmissionById, createSubmission, gradeSubmission } = require('../controllers/submissions.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();

router.use(authenticate);

router.get('/', getSubmissions);
router.get('/:id', getSubmissionById);
router.post('/', authorize('STUDENT'), createSubmission);
router.patch('/:id/grade', authorize('ADMIN', 'TEACHER'), gradeSubmission);

module.exports = router;
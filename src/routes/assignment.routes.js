const { Router } = require('express');
const { getAssignments, getAssignmentById, createAssignment, updateAssignment, deleteAssignment } = require('../controllers/assignment.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { body } = require('express-validator');

const router = Router();

router.use(authenticate);

router.get('/', getAssignments);
router.get('/:id', getAssignmentById);

router.post('/', authorize('ADMIN', 'TEACHER'), [
  body('courseId').notEmpty().withMessage('courseId is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
], createAssignment);

router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateAssignment);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteAssignment);

module.exports = router;
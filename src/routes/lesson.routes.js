const { Router } = require('express');
const { getLessons, getLessonById, createLesson, updateLesson, deleteLesson } = require('../controllers/lesson.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { body } = require('express-validator');

const router = Router();

router.get('/', authenticate, getLessons);
router.get('/:id', authenticate, getLessonById);

router.use(authenticate);

router.post('/', authorize('ADMIN', 'TEACHER'), [
  body('moduleId').notEmpty().withMessage('moduleId is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
], createLesson);

router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateLesson);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteLesson);

module.exports = router;
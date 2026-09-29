const { Router } = require('express');
const { getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz, addQuestion, updateQuestion, deleteQuestion, submitQuiz, getMyAttempts } = require('../controllers/quiz.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { body } = require('express-validator');

const router = Router();
router.use(authenticate);

router.get('/', getQuizzes);
router.get('/:id', getQuizById);
router.get('/:id/attempts', getMyAttempts);

router.post('/', authorize('ADMIN', 'TEACHER'), [
  body('courseId').notEmpty().withMessage('courseId is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
], createQuiz);

router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateQuiz);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteQuiz);
router.post('/:id/questions', authorize('ADMIN', 'TEACHER'), addQuestion);
router.patch('/:id/questions/:questionId', authorize('ADMIN', 'TEACHER'), updateQuestion);
router.delete('/:id/questions/:questionId', authorize('ADMIN', 'TEACHER'), deleteQuestion);
router.post('/:id/attempt', authorize('STUDENT'), submitQuiz);

module.exports = router;
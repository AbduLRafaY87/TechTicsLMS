const { Router } = require('express');
const { getModules, getModuleById, createModule, updateModule, deleteModule } = require('../controllers/module.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { body } = require('express-validator');

const router = Router();

const moduleValidator = [
  body('courseId').notEmpty().withMessage('courseId is required'),
  body('title').trim().notEmpty().withMessage('Title is required'),
];

router.get('/', getModules);
router.get('/:id', getModuleById);

router.use(authenticate);

router.post('/', authorize('ADMIN', 'TEACHER'), moduleValidator, createModule);
router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateModule);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteModule);

module.exports = router;
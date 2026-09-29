const { Router } = require('express');
const { getAllUsers, getUserById, updateUser, deleteUser, deleteMe } = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { body } = require('express-validator');

const router = Router();

router.use(authenticate);

router.get('/', authorize('ADMIN'), getAllUsers);
router.get('/:id', authorize('ADMIN', 'TEACHER', 'STUDENT'), getUserById);
router.patch('/:id', [
  body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
  body('password').optional().isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], updateUser);
router.delete('/me', deleteMe);  // before /:id
router.delete('/:id', authorize('ADMIN'), deleteUser);

module.exports = router;
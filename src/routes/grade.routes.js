const { Router } = require('express');
const { getGrades, createGrade, updateGrade, deleteGrade, getGradebook } = require('../controllers/grade.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();
router.use(authenticate);

router.get('/', getGrades);
router.get('/gradebook', authorize('ADMIN', 'TEACHER'), getGradebook);
router.post('/', authorize('ADMIN', 'TEACHER'), createGrade);
router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateGrade);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteGrade);

module.exports = router;
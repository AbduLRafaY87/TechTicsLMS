const { Router } = require('express');
const {
  getAllCourses, getCourseById, createCourse, updateCourse, deleteCourse,
  enrollCourse, unenrollCourse, getCourseStudents, getMyCourses, getMyEnrollmentRequests,
} = require('../controllers/course.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { createCourseValidator, updateCourseValidator } = require('../validators/course.validator');

const router = Router();

// Public routes
router.get('/', getAllCourses);

// Authenticated routes — specific paths before /:id
router.get('/my-courses', authenticate, getMyCourses);
router.get('/my-enrollment-requests', authenticate, authorize('STUDENT'), getMyEnrollmentRequests);

// Param routes
router.get('/:id', getCourseById);
router.get('/:id/students', authenticate, authorize('ADMIN', 'TEACHER'), getCourseStudents);

router.use(authenticate);

router.post('/', authorize('ADMIN', 'TEACHER'), createCourseValidator, createCourse);
router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateCourseValidator, updateCourse);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteCourse);
router.post('/:id/enroll', authorize('STUDENT'), enrollCourse);
router.delete('/:id/enroll', authorize('STUDENT'), unenrollCourse);

module.exports = router;
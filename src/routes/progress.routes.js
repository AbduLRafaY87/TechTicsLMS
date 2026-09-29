const { Router } = require('express');
const { getProgress, markLessonComplete, unmarkLessonComplete, getCourseSummary, getAllCoursesSummary } = require('../controllers/progress.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', getProgress);
router.get('/summary', getAllCoursesSummary);
router.get('/course/:courseId', getCourseSummary);
router.post('/lesson/:lessonId/complete', markLessonComplete);
router.delete('/lesson/:lessonId/complete', unmarkLessonComplete);

module.exports = router;
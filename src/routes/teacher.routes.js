const { Router } = require('express');
const {
  // Dashboard
  getTeacherDashboard,
  // Courses
  getTeacherCourses, getTeacherCourseById, createTeacherCourse, updateTeacherCourse,
  deleteTeacherCourse, toggleCoursePublish,
  // Students
  getCourseStudents, removeStudentFromCourse, getAllTeacherStudents, getStudentProgress,
  // Modules
  getCourseModules, createCourseModule, updateModule, deleteModule, reorderModules,
  // Lessons
  getModuleLessons, createLesson, updateLesson, deleteLesson, reorderLessons,
  // Assignments
  getTeacherAssignments, getTeacherAssignmentById, createAssignment, updateAssignment, deleteAssignment,
  // Submissions
  getTeacherSubmissions, getSubmissionById, gradeSubmission, bulkGradeSubmissions,
  // Quizzes
  getTeacherQuizzes, getTeacherQuizById, createQuiz, updateQuiz, deleteQuiz, toggleQuizStatus,
  // Questions
  getQuizQuestions, addQuestion, bulkAddQuestions, updateQuestion, deleteQuestion, getQuizAttempts,
  // Attendance
  getTeacherAttendance, markAttendance, markBulkAttendance, getAttendanceSummary,
  // Announcements
  getTeacherAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement,
  // Grades
  getTeacherGrades, getGradebook, createGrade, updateGrade, deleteGrade,
} = require('../controllers/teacher.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();

router.use(authenticate);
router.use(authorize('ADMIN', 'TEACHER'));

// ─── Dashboard ────────────────────────────────────────────────────────────────
router.get('/dashboard', getTeacherDashboard);

// ─── Courses ──────────────────────────────────────────────────────────────────
router.get('/courses', getTeacherCourses);
router.get('/courses/:id', getTeacherCourseById);
router.post('/courses', createTeacherCourse);
router.patch('/courses/:id', updateTeacherCourse);
router.delete('/courses/:id', deleteTeacherCourse);
router.patch('/courses/:id/publish', toggleCoursePublish);

// ─── Course Students ──────────────────────────────────────────────────────────
router.get('/courses/:id/students', getCourseStudents);
router.delete('/courses/:id/students/:userId', removeStudentFromCourse);

// ─── Modules ──────────────────────────────────────────────────────────────────
router.get('/courses/:id/modules', getCourseModules);
router.post('/courses/:id/modules', createCourseModule);
router.patch('/courses/:id/modules/reorder', reorderModules);
router.patch('/modules/:moduleId', updateModule);
router.delete('/modules/:moduleId', deleteModule);

// ─── Lessons ──────────────────────────────────────────────────────────────────
router.get('/modules/:moduleId/lessons', getModuleLessons);
router.post('/modules/:moduleId/lessons', createLesson);
router.patch('/modules/:moduleId/lessons/reorder', reorderLessons);
router.patch('/lessons/:lessonId', updateLesson);
router.delete('/lessons/:lessonId', deleteLesson);

// ─── Assignments ──────────────────────────────────────────────────────────────
router.get('/assignments', getTeacherAssignments);
router.get('/assignments/:id', getTeacherAssignmentById);
router.post('/assignments', createAssignment);
router.patch('/assignments/:id', updateAssignment);
router.delete('/assignments/:id', deleteAssignment);

// ─── Submissions ──────────────────────────────────────────────────────────────
router.get('/submissions', getTeacherSubmissions);
router.get('/submissions/:id', getSubmissionById);
router.patch('/submissions/:id/grade', gradeSubmission);
router.patch('/submissions/bulk-grade', bulkGradeSubmissions);

// ─── Quizzes ──────────────────────────────────────────────────────────────────
router.get('/quizzes', getTeacherQuizzes);
router.get('/quizzes/:id', getTeacherQuizById);
router.post('/quizzes', createQuiz);
router.patch('/quizzes/:id', updateQuiz);
router.delete('/quizzes/:id', deleteQuiz);
router.patch('/quizzes/:id/publish', toggleQuizStatus);

// ─── Questions ────────────────────────────────────────────────────────────────
router.get('/quizzes/:id/questions', getQuizQuestions);
router.post('/quizzes/:id/questions', addQuestion);
router.post('/quizzes/:id/questions/bulk', bulkAddQuestions);
router.get('/quizzes/:id/attempts', getQuizAttempts);
router.patch('/questions/:questionId', updateQuestion);
router.delete('/questions/:questionId', deleteQuestion);

// ─── Attendance ───────────────────────────────────────────────────────────────
router.get('/attendance', getTeacherAttendance);
router.get('/attendance/summary', getAttendanceSummary);
router.post('/attendance', markAttendance);
router.post('/attendance/bulk', markBulkAttendance);

// ─── Announcements ────────────────────────────────────────────────────────────
router.get('/announcements', getTeacherAnnouncements);
router.post('/announcements', createAnnouncement);
router.patch('/announcements/:id', updateAnnouncement);
router.delete('/announcements/:id', deleteAnnouncement);

// ─── Grades ───────────────────────────────────────────────────────────────────
router.get('/grades', getTeacherGrades);
router.get('/grades/gradebook', getGradebook);
router.post('/grades', createGrade);
router.patch('/grades/:id', updateGrade);
router.delete('/grades/:id', deleteGrade);

// ─── Students (global across courses) ────────────────────────────────────────
router.get('/students', getAllTeacherStudents);
router.get('/students/:userId/progress', getStudentProgress);

module.exports = router;
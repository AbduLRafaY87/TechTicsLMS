const prisma = require('../config/prisma');
const { validationResult } = require('express-validator');

const getQuizzes = async (req, res) => {
  const { courseId } = req.query;
  const where = {};
  if (courseId) where.courseId = courseId;
  if (req.user.role === 'STUDENT') where.status = 'PUBLISHED';
  try {
    const quizzes = await prisma.quiz.findMany({
      where,
      include: { _count: { select: { questions: true, attempts: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { quizzes } });
  } catch (err) {
    console.error('[getQuizzes]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getQuizById = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: {
        questions: { orderBy: { order: 'asc' } },
        course: { select: { id: true, title: true, teacherId: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    if (req.user.role === 'STUDENT') {
      quiz.questions = quiz.questions.map(({ correctOption, explanation, ...q }) => q);
    }
    return res.status(200).json({ success: true, data: { quiz } });
  } catch (err) {
    console.error('[getQuizById]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const createQuiz = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });
  const { courseId, title, description, duration, maxAttempts, passingScore } = req.body;
  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (req.user.role !== 'ADMIN' && course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const quiz = await prisma.quiz.create({ data: { courseId, title, description, duration, maxAttempts, passingScore } });
    return res.status(201).json({ success: true, message: 'Quiz created', data: { quiz } });
  } catch (err) {
    console.error('[createQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateQuiz = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    if (req.user.role !== 'ADMIN' && quiz.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const { title, description, duration, maxAttempts, passingScore, status } = req.body;
    const data = {};
    if (title !== undefined) data.title = title;
    if (description !== undefined) data.description = description;
    if (duration !== undefined) data.duration = duration;
    if (maxAttempts !== undefined) data.maxAttempts = maxAttempts;
    if (passingScore !== undefined) data.passingScore = passingScore;
    if (status !== undefined) data.status = status;
    const updated = await prisma.quiz.update({ where: { id: req.params.id }, data });
    return res.status(200).json({ success: true, message: 'Quiz updated', data: { quiz: updated } });
  } catch (err) {
    console.error('[updateQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteQuiz = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    if (req.user.role !== 'ADMIN' && quiz.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.quiz.delete({ where: { id: req.params.id } });
    return res.status(200).json({ success: true, message: 'Quiz deleted' });
  } catch (err) {
    console.error('[deleteQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const addQuestion = async (req, res) => {
  try {
    const quiz = await prisma.quiz.findUnique({ where: { id: req.params.id }, include: { course: true } });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    if (req.user.role !== 'ADMIN' && quiz.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const { text, options, correctOption, explanation, points, order } = req.body;
    if (!text || !options || !correctOption)
      return res.status(422).json({ success: false, message: 'text, options, and correctOption are required' });
    const question = await prisma.question.create({
      data: { quizId: req.params.id, text, options, correctOption, explanation, points: points ?? 1, order: order ?? 0 },
    });
    return res.status(201).json({ success: true, message: 'Question added', data: { question } });
  } catch (err) {
    console.error('[addQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const updateQuestion = async (req, res) => {
  try {
    const question = await prisma.question.findUnique({
      where: { id: req.params.questionId },
      include: { quiz: { include: { course: true } } },
    });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    if (req.user.role !== 'ADMIN' && question.quiz.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    const { text, options, correctOption, explanation, points, order } = req.body;
    const data = {};
    if (text !== undefined) data.text = text;
    if (options !== undefined) data.options = options;
    if (correctOption !== undefined) data.correctOption = correctOption;
    if (explanation !== undefined) data.explanation = explanation;
    if (points !== undefined) data.points = points;
    if (order !== undefined) data.order = order;
    const updated = await prisma.question.update({ where: { id: req.params.questionId }, data });
    return res.status(200).json({ success: true, message: 'Question updated', data: { question: updated } });
  } catch (err) {
    console.error('[updateQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const deleteQuestion = async (req, res) => {
  try {
    const question = await prisma.question.findUnique({
      where: { id: req.params.questionId },
      include: { quiz: { include: { course: true } } },
    });
    if (!question) return res.status(404).json({ success: false, message: 'Question not found' });
    if (req.user.role !== 'ADMIN' && question.quiz.course.teacherId !== req.user.id)
      return res.status(403).json({ success: false, message: 'Forbidden' });
    await prisma.question.delete({ where: { id: req.params.questionId } });
    return res.status(200).json({ success: true, message: 'Question deleted' });
  } catch (err) {
    console.error('[deleteQuestion]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const submitQuiz = async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers))
    return res.status(422).json({ success: false, message: 'answers array is required' });
  try {
    const quiz = await prisma.quiz.findUnique({
      where: { id: req.params.id },
      include: { questions: true },
    });
    if (!quiz) return res.status(404).json({ success: false, message: 'Quiz not found' });
    if (quiz.status !== 'PUBLISHED')
      return res.status(400).json({ success: false, message: 'Quiz is not published' });

    const attemptCount = await prisma.quizAttempt.count({
      where: { quizId: req.params.id, userId: req.user.id },
    });
    if (attemptCount >= quiz.maxAttempts)
      return res.status(400).json({ success: false, message: 'Maximum attempts reached' });

    const questionMap = Object.fromEntries(quiz.questions.map(q => [q.id, q]));
    let score = 0;
    let totalPoints = 0;
    const processedAnswers = answers.map(({ questionId, selectedOption }) => {
      const question = questionMap[questionId];
      if (!question) return null;
      const isCorrect = question.correctOption === selectedOption;
      if (isCorrect) score += question.points;
      totalPoints += question.points;
      return { questionId, selectedOption, isCorrect };
    }).filter(Boolean);

    const scorePercent = totalPoints > 0 ? (score / totalPoints) * 100 : 0;
    const passed = scorePercent >= quiz.passingScore;

    const attempt = await prisma.quizAttempt.create({
      data: {
        quizId: req.params.id,
        userId: req.user.id,
        score: scorePercent,
        passed,
        completedAt: new Date(),
        answers: { create: processedAnswers },
      },
      include: { answers: true },
    });

    return res.status(201).json({ success: true, message: 'Quiz submitted', data: { attempt, score: scorePercent, passed } });
  } catch (err) {
    console.error('[submitQuiz]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

const getMyAttempts = async (req, res) => {
  try {
    const attempts = await prisma.quizAttempt.findMany({
      where: { quizId: req.params.id, userId: req.user.id },
      include: { answers: true },
      orderBy: { startedAt: 'desc' },
    });
    return res.status(200).json({ success: true, data: { attempts } });
  } catch (err) {
    console.error('[getMyAttempts]', err);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

module.exports = { getQuizzes, getQuizById, createQuiz, updateQuiz, deleteQuiz, addQuestion, updateQuestion, deleteQuestion, submitQuiz, getMyAttempts };
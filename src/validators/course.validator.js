const { body } = require('express-validator');

const createCourseValidator = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').optional().trim(),
];

const updateCourseValidator = [
  body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
  body('description').optional().trim(),
];

module.exports = { createCourseValidator, updateCourseValidator };
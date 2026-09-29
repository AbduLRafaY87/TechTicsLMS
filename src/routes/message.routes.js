const { Router } = require('express');
const { getMessages, getMessageById, sendMessage, deleteMessage } = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth');

const router = Router();
router.use(authenticate);

router.get('/', getMessages);
router.get('/:id', getMessageById);
router.post('/', sendMessage);
router.delete('/:id', deleteMessage);

module.exports = router;
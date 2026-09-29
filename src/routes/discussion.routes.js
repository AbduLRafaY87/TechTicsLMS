const { Router } = require('express');
const multer     = require('multer');
const path       = require('path');
const {
  getDiscussions, getDiscussionById, createDiscussion, updateDiscussion,
  deleteDiscussion, addReply, deleteReply,
} = require('../controllers/discussion.controller');
const { authenticate } = require('../middleware/auth');

// ─── Multer config ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/discussions'),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg'];
  cb(null, allowed.includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB

// ─── Routes ───────────────────────────────────────────────────────────────────
const router = Router();
router.use(authenticate);

router.get('/all',               getDiscussions);
router.get('/',                  getDiscussions);
router.get('/:id',               getDiscussionById);
router.post('/',                 createDiscussion);
router.patch('/:id',             updateDiscussion);
router.delete('/:id',            deleteDiscussion);
router.post('/:id/replies',      upload.single('attachment'), addReply);
router.delete('/:id/replies/:replyId', deleteReply);

module.exports = router;
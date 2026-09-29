const { Router } = require('express');
const { getAnnouncements, getAnnouncementById, createAnnouncement, updateAnnouncement, deleteAnnouncement } = require('../controllers/announcement.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

const router = Router();
router.use(authenticate);

router.get('/', getAnnouncements);
router.get('/:id', getAnnouncementById);
router.post('/', authorize('ADMIN', 'TEACHER'), createAnnouncement);
router.patch('/:id', authorize('ADMIN', 'TEACHER'), updateAnnouncement);
router.delete('/:id', authorize('ADMIN', 'TEACHER'), deleteAnnouncement);

module.exports = router;
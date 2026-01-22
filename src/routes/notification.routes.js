const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Notification routes
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.delete('/all', notificationController.deleteAllNotifications);

router
  .route('/:notificationId')
  .patch(notificationController.markAsRead)
  .delete(notificationController.deleteNotification);

module.exports = router;

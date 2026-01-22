const express = require('express');
const messageController = require('../controllers/messageController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All routes require authentication
router.use(protect);

// User routes
router.post('/', messageController.createMessage);
router.get('/user', messageController.getMyMessages);

// Admin routes
router.get('/stats', restrictTo('Admin'), messageController.getMessageStats);
router.get('/', restrictTo('Admin'), messageController.getAllMessages);
router.get('/:messageId', messageController.getMessageById);
router.patch('/:messageId', restrictTo('Admin'), messageController.updateMessage);
router.post('/:messageId/respond', restrictTo('Admin'), messageController.respondToMessage);
router.patch('/:messageId/read', restrictTo('Admin'), messageController.markAsRead);
router.delete('/:messageId', restrictTo('Admin'), messageController.deleteMessage);

module.exports = router;

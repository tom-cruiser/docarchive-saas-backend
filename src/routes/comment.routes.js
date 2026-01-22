const express = require('express');
const commentController = require('../controllers/commentController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validator');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Comment routes for a document
router
  .route('/document/:documentId')
  .get(commentController.getComments)
  .post(validate('addComment'), commentController.addComment);

// Specific comment routes
router
  .route('/:commentId')
  .patch(validate('updateComment'), commentController.updateComment)
  .delete(commentController.deleteComment);

// Reaction routes
router.post('/:commentId/reactions', commentController.addReaction);
router.delete('/:commentId/reactions', commentController.removeReaction);

module.exports = router;

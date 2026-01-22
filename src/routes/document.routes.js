const express = require('express');
const documentController = require('../controllers/documentController');
const { protect, restrictTo } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const { validate } = require('../middleware/validator');
const { uploadLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Document routes
router
  .route('/')
  .get(documentController.getAllDocuments)
  .post(uploadLimiter, upload.single('file'), validate('uploadDocument'), documentController.uploadDocument);

router.get('/statistics', documentController.getStatistics);
router.get('/dashboard-stats', documentController.getDashboardStats);

router
  .route('/:id')
  .get(documentController.getDocument)
  .patch(validate('updateDocument'), documentController.updateDocument)
  .delete(documentController.deleteDocument);

router.delete('/:id/permanent', restrictTo('admin'), documentController.permanentDeleteDocument);

router.get('/:id/download', documentController.downloadDocument);

// Sharing routes
router.post('/:id/share', validate('shareDocument'), documentController.shareDocument);
router.delete('/:id/share/:userId', documentController.unshareDocument);

// Version routes
router.get('/:id/versions', documentController.getVersions);
router.post('/:id/versions/:versionNumber/restore', documentController.restoreVersion);

module.exports = router;

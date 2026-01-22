const express = require('express');
const authController = require('../controllers/authController');
const { validate } = require('../middleware/validator');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Public routes with rate limiting
router.post('/register', authLimiter, validate('register'), authController.register);
router.post('/login', authLimiter, validate('login'), authController.login);
router.post('/forgot-password', passwordResetLimiter, validate('forgotPassword'), authController.forgotPassword);
router.patch('/reset-password/:token', passwordResetLimiter, validate('resetPassword'), authController.resetPassword);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/refresh-token', authController.refreshToken);

// Protected routes
router.use(protect);

router.post('/logout', authController.logout);
router.get('/me', authController.getMe);
router.patch('/change-password', validate('changePassword'), authController.changePassword);

// Two-factor authentication routes
router.post('/2fa/setup', authController.setupTwoFactor);
router.post('/2fa/enable', authController.enableTwoFactor);
router.post('/2fa/disable', authController.disableTwoFactor);

module.exports = router;

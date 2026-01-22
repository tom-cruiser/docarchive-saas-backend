const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { sendEmail } = require('../services/emailService');
const { log, logFailure } = require('../middleware/activityLogger');
const { v4: uuidv4 } = require('uuid');

/**
 * Generate JWT token
 */
const signToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};

/**
 * Generate refresh token
 */
const signRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
  });
};

/**
 * Send token response
 */
const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);

  // Remove password from output
  user.password = undefined;
  user.twoFactorSecret = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    refreshToken,
    data: {
      user,
    },
  });
};

/**
 * Register new user
 */
exports.register = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, password, role } = req.body;

  // Generate tenant ID if not provided (for new tenants)
  const tenantId = req.body.tenantId || `tenant_${uuidv4()}`;

  // Check if user already exists
  const existingUser = await User.findOne({ email, tenantId });
  if (existingUser) {
    return next(new AppError('User already exists with this email', 400));
  }

  // Create user
  const user = await User.create({
    tenantId,
    firstName,
    lastName,
    email,
    password,
    role,
    isVerified: process.env.NODE_ENV === 'development', // Auto-verify in development
  });

  // Send response immediately
  createSendToken(user, 201, res);
  
  // Only send verification email in production (async, after response)
  if (process.env.NODE_ENV === 'production') {
    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = crypto.createHash('sha256').update(verificationToken).digest('hex');
    user.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
    user.save({ validateBeforeSave: false }).then(() => {
      // Send verification email (don't block registration if email fails)
      const verificationUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/verify-email/${verificationToken}`;
      sendEmail({
        to: user.email,
        subject: 'Verify Your Email - DocArchive',
        template: 'verifyEmail',
        data: {
          name: user.firstName,
          verificationUrl,
        },
      }).catch(err => console.error('Failed to send verification email:', err.message));
    }).catch(err => console.error('Failed to save verification token:', err.message));
  }

  // Log activity (async, after response)
  log(req, 'register', 'user', user._id).catch(err => console.error('Failed to log activity:', err.message));
});

/**
 * Login user
 */
exports.login = catchAsync(async (req, res, next) => {
  const { email, password, twoFactorCode } = req.body;

  // Check if email and password exist
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }

  // Get user with password
  const user = await User.findOne({ email }).select('+password +twoFactorSecret');

  // Check if user exists and password is correct
  if (!user || !(await user.comparePassword(password))) {
    logFailure(req, 'login', new Error('Invalid credentials')).catch(err => console.error('Failed to log:', err.message));
    return next(new AppError('Incorrect email or password', 401));
  }

  // Check if account is locked
  if (user.isLocked) {
    logFailure(req, 'login', new Error('Account locked')).catch(err => console.error('Failed to log:', err.message));
    return next(new AppError('Your account is temporarily locked due to multiple failed login attempts', 423));
  }

  // Check if account is active
  if (!user.isActive) {
    return next(new AppError('Your account has been deactivated', 401));
  }

  // Check two-factor authentication
  if (user.twoFactorEnabled) {
    if (!twoFactorCode) {
      return res.status(200).json({
        status: 'success',
        requiresTwoFactor: true,
        message: 'Please provide two-factor authentication code',
      });
    }

    // Verify 2FA code
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: twoFactorCode,
      window: 2,
    });

    if (!verified) {
      await user.incLoginAttempts();
      logFailure(req, 'login', new Error('Invalid 2FA code')).catch(err => console.error('Failed to log:', err.message));
      return next(new AppError('Invalid two-factor authentication code', 401));
    }
  }

  // Send token immediately
  createSendToken(user, 200, res);

  // Reset login attempts and update last login (async, after response)
  Promise.all([
    user.loginAttempts > 0 ? user.resetLoginAttempts() : Promise.resolve(),
    User.updateOne({ _id: user._id }, { lastLogin: Date.now() }),
    log(req, 'login', 'user', user._id)
  ]).catch(err => console.error('Failed to update user or log activity:', err.message));
});

/**
 * Logout user
 */
exports.logout = catchAsync(async (req, res, next) => {
  log(req, 'logout', 'user', req.user._id).catch(err => console.error('Failed to log:', err.message));

  res.status(200).json({
    status: 'success',
    message: 'Logged out successfully',
  });
});

/**
 * Forgot password
 */
exports.forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;

  // Get user by email
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if email exists
    return res.status(200).json({
      status: 'success',
      message: 'If your email is registered, you will receive a password reset link',
    });
  }

  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
  user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  await user.save({ validateBeforeSave: false });

  // Send reset email
  const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/reset-password/${resetToken}`;
  await sendEmail({
    to: user.email,
    subject: 'Password Reset Request - DocArchive',
    template: 'resetPassword',
    data: {
      name: user.firstName,
      resetUrl,
    },
  });

  res.status(200).json({
    status: 'success',
    message: 'Password reset link sent to email',
  });
});

/**
 * Reset password
 */
exports.resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;

  // Hash token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user by token
  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  // Update password
  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Send confirmation email
  await sendEmail({
    to: user.email,
    subject: 'Password Changed Successfully - DocArchive',
    template: 'passwordChanged',
    data: {
      name: user.firstName,
    },
  });

  // Send token
  createSendToken(user, 200, res);
});

/**
 * Change password (when logged in)
 */
exports.changePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;

  // Get user with password
  const user = await User.findById(req.user._id).select('+password');

  // Check current password
  if (!(await user.comparePassword(currentPassword))) {
    return next(new AppError('Current password is incorrect', 401));
  }

  // Update password
  user.password = newPassword;
  await user.save();

  // Send new token
  createSendToken(user, 200, res);

  // Log activity and send email (async, after response)
  Promise.all([
    log(req, 'password_change', 'user', user._id),
    sendEmail({
      to: user.email,
      subject: 'Password Changed Successfully - DocArchive',
      template: 'passwordChanged',
      data: {
        name: user.firstName,
      },
    })
  ]).catch(err => console.error('Failed to log activity or send email:', err.message));
});

/**
 * Setup two-factor authentication
 */
exports.setupTwoFactor = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  if (user.twoFactorEnabled) {
    return next(new AppError('Two-factor authentication is already enabled', 400));
  }

  // Generate secret
  const secret = speakeasy.generateSecret({
    name: `${process.env.TWO_FACTOR_APP_NAME} (${user.email})`,
    length: 32,
  });

  // Generate QR code
  const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

  // Save secret (temporarily)
  user.twoFactorSecret = secret.base32;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    data: {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    },
  });
});

/**
 * Enable two-factor authentication
 */
exports.enableTwoFactor = catchAsync(async (req, res, next) => {
  const { code } = req.body;

  const user = await User.findById(req.user._id).select('+twoFactorSecret');

  if (!user.twoFactorSecret) {
    return next(new AppError('Please setup two-factor authentication first', 400));
  }

  // Verify code
  const verified = speakeasy.totp.verify({
    secret: user.twoFactorSecret,
    encoding: 'base32',
    token: code,
    window: 2,
  });

  if (!verified) {
    return next(new AppError('Invalid verification code', 400));
  }

  // Enable 2FA
  user.twoFactorEnabled = true;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Two-factor authentication enabled successfully',
  });
});

/**
 * Disable two-factor authentication
 */
exports.disableTwoFactor = catchAsync(async (req, res, next) => {
  const { password } = req.body;

  const user = await User.findById(req.user._id).select('+password');

  // Verify password
  if (!(await user.comparePassword(password))) {
    return next(new AppError('Password is incorrect', 401));
  }

  // Disable 2FA
  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Two-factor authentication disabled successfully',
  });
});

/**
 * Verify email
 */
exports.verifyEmail = catchAsync(async (req, res, next) => {
  const { token } = req.params;

  // Hash token
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

  // Find user
  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    return next(new AppError('Token is invalid or has expired', 400));
  }

  // Update user
  user.isVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  res.status(200).json({
    status: 'success',
    message: 'Email verified successfully',
  });
});

/**
 * Get current user
 */
exports.getMe = catchAsync(async (req, res, next) => {
  res.status(200).json({
    status: 'success',
    data: {
      user: req.user,
    },
  });
});

/**
 * Refresh token
 */
exports.refreshToken = catchAsync(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(new AppError('Refresh token is required', 400));
  }

  // Verify refresh token
  const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

  // Get user
  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    return next(new AppError('User not found or inactive', 401));
  }

  // Generate new tokens
  const newToken = signToken(user._id);
  const newRefreshToken = signRefreshToken(user._id);

  res.status(200).json({
    status: 'success',
    token: newToken,
    refreshToken: newRefreshToken,
  });
});

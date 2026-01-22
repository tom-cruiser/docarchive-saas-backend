const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { log } = require('../middleware/activityLogger');

/**
 * Get current user profile
 */
exports.getProfile = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

/**
 * Update user profile
 */
exports.updateProfile = catchAsync(async (req, res, next) => {
  const { firstName, lastName, phone, organization, bio, preferences } = req.body;

  // Fields that are not allowed to be updated here
  if (req.body.password || req.body.email || req.body.role) {
    return next(new AppError('This route is not for password, email, or role updates', 400));
  }

  const user = await User.findById(req.user._id);

  // Update allowed fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (phone !== undefined) user.phone = phone;
  if (organization !== undefined) user.organization = organization;
  if (bio !== undefined) user.bio = bio;
  if (preferences) user.preferences = { ...user.preferences, ...preferences };

  await user.save();

  // Log activity
  await log(req, 'profile_update', 'user', user._id);

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

/**
 * Get all users (admin only)
 */
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    search,
    role,
    isActive,
    sortBy = '-createdAt',
  } = req.query;

  // Build query
  const query = {
    tenantId: req.user.tenantId,
  };

  // Search
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  // Filter by role
  if (role) {
    query.role = role;
  }

  // Filter by active status
  if (isActive !== undefined) {
    query.isActive = isActive === 'true';
  }

  // Execute query
  const users = await User.find(query)
    .sort(sortBy)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .select('-password -twoFactorSecret');

  // Get total count
  const total = await User.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: users.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: {
      users,
    },
  });
});

/**
 * Get user by ID (admin only)
 */
exports.getUser = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  }).select('-password -twoFactorSecret');

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

/**
 * Update user (admin only)
 */
exports.updateUser = catchAsync(async (req, res, next) => {
  const { firstName, lastName, email, role, isActive } = req.body;

  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Update fields
  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (email) user.email = email;
  if (role) user.role = role;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();

  // Log activity
  await log(req, 'user_update', 'user', user._id);

  res.status(200).json({
    status: 'success',
    data: {
      user,
    },
  });
});

/**
 * Delete user (admin only)
 */
exports.deleteUser = catchAsync(async (req, res, next) => {
  const user = await User.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!user) {
    return next(new AppError('User not found', 404));
  }

  // Don't allow deleting yourself
  if (user._id.toString() === req.user._id.toString()) {
    return next(new AppError('You cannot delete your own account', 400));
  }

  // Soft delete - deactivate account
  user.isActive = false;
  await user.save();

  // Log activity
  await log(req, 'user_delete', 'user', user._id);

  res.status(200).json({
    status: 'success',
    message: 'User deleted successfully',
  });
});

/**
 * Get user activity logs
 */
exports.getUserActivity = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 50,
    action,
    startDate,
    endDate,
  } = req.query;

  const ActivityLog = require('../models/ActivityLog');

  // Build query
  const query = {
    user: req.params.id || req.user._id,
    tenantId: req.user.tenantId,
  };

  // Filter by action
  if (action) {
    query.action = action;
  }

  // Filter by date range
  if (startDate || endDate) {
    query.timestamp = {};
    if (startDate) query.timestamp.$gte = new Date(startDate);
    if (endDate) query.timestamp.$lte = new Date(endDate);
  }

  // Execute query
  const activities = await ActivityLog.find(query)
    .populate('user', 'firstName lastName email')
    .sort('-timestamp')
    .limit(limit * 1)
    .skip((page - 1) * limit);

  // Get total count
  const total = await ActivityLog.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: activities.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: {
      activities,
    },
  });
});

/**
 * Get user statistics
 */
exports.getUserStats = catchAsync(async (req, res, next) => {
  const Document = require('../models/Document');
  const Comment = require('../models/Comment');

  const userId = req.params.id || req.user._id;

  // Get document stats
  const documentStats = await Document.aggregate([
    {
      $match: {
        uploadedBy: userId,
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: null,
        totalDocuments: { $sum: 1 },
        totalSize: { $sum: '$size' },
        categories: { $addToSet: '$category' },
      },
    },
  ]);

  // Get shared documents count
  const sharedCount = await Document.countDocuments({
    'sharedWith.user': userId,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  // Get comments count
  const commentsCount = await Comment.countDocuments({
    author: userId,
    tenantId: req.user.tenantId,
  });

  res.status(200).json({
    status: 'success',
    data: {
      documents: documentStats[0] || {
        totalDocuments: 0,
        totalSize: 0,
        categories: [],
      },
      sharedDocuments: sharedCount,
      comments: commentsCount,
    },
  });
});

/**
 * Update user preferences
 */
exports.updatePreferences = catchAsync(async (req, res, next) => {
  const user = await User.findById(req.user._id);

  user.preferences = {
    ...user.preferences,
    ...req.body,
  };

  await user.save();

  res.status(200).json({
    status: 'success',
    data: {
      preferences: user.preferences,
    },
  });
});

/**
 * Search users
 */
exports.searchUsers = catchAsync(async (req, res, next) => {
  const { q, limit = 10 } = req.query;

  if (!q) {
    return next(new AppError('Please provide a search query', 400));
  }

  const users = await User.find({
    tenantId: req.user.tenantId,
    isActive: true,
    $or: [
      { firstName: { $regex: q, $options: 'i' } },
      { lastName: { $regex: q, $options: 'i' } },
      { email: { $regex: q, $options: 'i' } },
    ],
  })
    .select('firstName lastName email')
    .limit(parseInt(limit));

  res.status(200).json({
    status: 'success',
    results: users.length,
    data: {
      users,
    },
  });
});

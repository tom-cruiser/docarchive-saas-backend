const Notification = require('../models/Notification');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * Get all notifications for current user
 */
exports.getNotifications = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    type,
    isRead,
  } = req.query;

  // Build query
  const query = {
    user: req.user._id,
    tenantId: req.user.tenantId,
  };

  // Filter by type
  if (type) {
    query.type = type;
  }

  // Filter by read status
  if (isRead !== undefined) {
    query.isRead = isRead === 'true';
  }

  // Execute query
  const notifications = await Notification.find(query)
    .populate('relatedUser', 'firstName lastName email')
    .populate('relatedDocument', 'name')
    .sort('-createdAt')
    .limit(limit * 1)
    .skip((page - 1) * limit);

  // Get total count
  const total = await Notification.countDocuments(query);

  // Get unread count
  const unreadCount = await Notification.countDocuments({
    user: req.user._id,
    tenantId: req.user.tenantId,
    isRead: false,
  });

  res.status(200).json({
    status: 'success',
    results: notifications.length,
    total,
    unreadCount,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: {
      notifications,
    },
  });
});

/**
 * Mark notification as read
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    user: req.user._id,
    tenantId: req.user.tenantId,
  });

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  notification.isRead = true;
  await notification.save();

  res.status(200).json({
    status: 'success',
    data: {
      notification,
    },
  });
});

/**
 * Mark all notifications as read
 */
exports.markAllAsRead = catchAsync(async (req, res, next) => {
  await Notification.updateMany(
    {
      user: req.user._id,
      tenantId: req.user.tenantId,
      isRead: false,
    },
    { isRead: true }
  );

  res.status(200).json({
    status: 'success',
    message: 'All notifications marked as read',
  });
});

/**
 * Delete notification
 */
exports.deleteNotification = catchAsync(async (req, res, next) => {
  const { notificationId } = req.params;

  const notification = await Notification.findOne({
    _id: notificationId,
    user: req.user._id,
    tenantId: req.user.tenantId,
  });

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  await Notification.deleteOne({ _id: notificationId });

  res.status(200).json({
    status: 'success',
    message: 'Notification deleted successfully',
  });
});

/**
 * Delete all notifications
 */
exports.deleteAllNotifications = catchAsync(async (req, res, next) => {
  await Notification.deleteMany({
    user: req.user._id,
    tenantId: req.user.tenantId,
  });

  res.status(200).json({
    status: 'success',
    message: 'All notifications deleted successfully',
  });
});

/**
 * Get unread notification count
 */
exports.getUnreadCount = catchAsync(async (req, res, next) => {
  const count = await Notification.countDocuments({
    user: req.user._id,
    tenantId: req.user.tenantId,
    isRead: false,
  });

  res.status(200).json({
    status: 'success',
    data: {
      count,
    },
  });
});

/**
 * Create notification (internal helper - not exposed as route)
 */
exports.createNotification = async (data) => {
  try {
    const notification = await Notification.create(data);
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

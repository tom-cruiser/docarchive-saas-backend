const Message = require('../models/Message');
const User = require('../models/User');
const Notification = require('../models/Notification');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

/**
 * Create a new support message (User)
 */
exports.createMessage = catchAsync(async (req, res, next) => {
  const { subject, message, category, priority } = req.body;

  const newMessage = await Message.create({
    tenantId: req.tenantId,
    user: req.user._id,
    subject,
    message,
    category: category || 'general',
    priority: priority || 'medium',
  });

  await newMessage.populate('user', 'firstName lastName email');

  // Create notification for all admins
  const admins = await User.find({ role: 'Admin' });
  const adminNotifications = admins.map(admin => ({
    tenantId: admin.tenantId,
    user: admin._id,
    type: 'message_received',
    title: 'New Support Message',
    message: `${req.user.firstName} ${req.user.lastName} sent a new support message: "${subject}"`,
    relatedMessage: newMessage._id,
    relatedUser: req.user._id,
  }));

  if (adminNotifications.length > 0) {
    await Notification.insertMany(adminNotifications);
  }

  res.status(201).json({
    status: 'success',
    data: { message: newMessage }
  });
});

/**
 * Get user's own messages
 */
exports.getMyMessages = catchAsync(async (req, res, next) => {
  const { status, page = 1, limit = 20 } = req.query;

  const query = {
    tenantId: req.tenantId,
    user: req.user._id,
  };

  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const [messages, total] = await Promise.all([
    Message.find(query)
      .populate('user', 'firstName lastName email')
      .populate('respondedBy', 'firstName lastName email')
      .sort('-createdAt')
      .skip(skip)
      .limit(parseInt(limit)),
    Message.countDocuments(query)
  ]);

  res.status(200).json({
    status: 'success',
    results: messages.length,
    data: {
      messages,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

/**
 * Get all messages (Admin only)
 */
exports.getAllMessages = catchAsync(async (req, res, next) => {
  const {
    status,
    priority,
    category,
    isRead,
    search,
    page = 1,
    limit = 20,
    sortBy = '-createdAt'
  } = req.query;

  const query = {};

  if (status) query.status = status;
  if (priority) query.priority = priority;
  if (category) query.category = category;
  if (isRead !== undefined) query.isRead = isRead === 'true';

  if (search) {
    query.$or = [
      { subject: { $regex: search, $options: 'i' } },
      { message: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;

  const [messages, total, unreadCount] = await Promise.all([
    Message.find(query)
      .populate('user', 'firstName lastName email tenantId')
      .populate('respondedBy', 'firstName lastName email')
      .sort(sortBy)
      .skip(skip)
      .limit(parseInt(limit)),
    Message.countDocuments(query),
    Message.countDocuments({ isRead: false })
  ]);

  res.status(200).json({
    status: 'success',
    results: messages.length,
    data: {
      messages,
      unreadCount,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    }
  });
});

/**
 * Get message by ID
 */
exports.getMessageById = catchAsync(async (req, res, next) => {
  const message = await Message.findById(req.params.messageId)
    .populate('user', 'firstName lastName email tenantId')
    .populate('respondedBy', 'firstName lastName email');

  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  // Check if user is admin or message owner
  if (req.user.role !== 'Admin' && message.user._id.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to view this message', 403));
  }

  res.status(200).json({
    status: 'success',
    data: { message }
  });
});

/**
 * Update message (Admin only)
 */
exports.updateMessage = catchAsync(async (req, res, next) => {
  const { status, priority, category, isRead } = req.body;

  const message = await Message.findById(req.params.messageId);

  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  if (status) message.status = status;
  if (priority) message.priority = priority;
  if (category) message.category = category;
  if (isRead !== undefined) message.isRead = isRead;

  await message.save();

  await message.populate('user', 'firstName lastName email');
  await message.populate('respondedBy', 'firstName lastName email');

  res.status(200).json({
    status: 'success',
    data: { message }
  });
});

/**
 * Respond to message (Admin only)
 */
exports.respondToMessage = catchAsync(async (req, res, next) => {
  const { response, status } = req.body;

  if (!response) {
    return next(new AppError('Response text is required', 400));
  }

  const message = await Message.findById(req.params.messageId).populate('user', 'firstName lastName email tenantId');

  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  message.response = response;
  message.respondedBy = req.user._id;
  message.respondedAt = new Date();
  message.status = status || 'resolved';
  message.isRead = true;

  await message.save();

  // Create notification for the user who sent the message
  await Notification.create({
    tenantId: message.user.tenantId,
    user: message.user._id,
    type: 'support_response',
    title: 'Support Response Received',
    message: `Your support request "${message.subject}" has been responded to by our team.`,
    relatedMessage: message._id,
    relatedUser: req.user._id,
  });

  await message.populate('respondedBy', 'firstName lastName email');

  res.status(200).json({
    status: 'success',
    data: { message }
  });
});

/**
 * Delete message (Admin only)
 */
exports.deleteMessage = catchAsync(async (req, res, next) => {
  const message = await Message.findByIdAndDelete(req.params.messageId);

  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  res.status(204).json({
    status: 'success',
    data: null
  });
});

/**
 * Mark message as read (Admin only)
 */
exports.markAsRead = catchAsync(async (req, res, next) => {
  const message = await Message.findByIdAndUpdate(
    req.params.messageId,
    { isRead: true },
    { new: true }
  ).populate('user', 'firstName lastName email');

  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  res.status(200).json({
    status: 'success',
    data: { message }
  });
});

/**
 * Get message statistics (Admin only)
 */
exports.getMessageStats = catchAsync(async (req, res, next) => {
  const [stats] = await Message.aggregate([
    {
      $facet: {
        statusCounts: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        priorityCounts: [
          { $group: { _id: '$priority', count: { $sum: 1 } } }
        ],
        categoryCounts: [
          { $group: { _id: '$category', count: { $sum: 1 } } }
        ],
        totalStats: [
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              unread: {
                $sum: { $cond: [{ $eq: ['$isRead', false] }, 1, 0] }
              },
              pending: {
                $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
              }
            }
          }
        ]
      }
    }
  ]);

  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});

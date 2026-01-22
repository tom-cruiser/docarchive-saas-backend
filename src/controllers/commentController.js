const Comment = require('../models/Comment');
const Document = require('../models/Document');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { log } = require('../middleware/activityLogger');
const { sendCommentNotificationEmail } = require('../services/emailService');

/**
 * Add comment to document
 */
exports.addComment = catchAsync(async (req, res, next) => {
  const { content, parentId } = req.body;
  const { documentId } = req.params;

  // Check if document exists and user has access
  const document = await Document.findOne({
    _id: documentId,
    tenantId: req.user.tenantId,
    isDeleted: false,
  }).populate('uploadedBy');

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'view')) {
    return next(new AppError('You do not have permission to comment on this document', 403));
  }

  // If it's a reply, check if parent comment exists
  if (parentId) {
    const parentComment = await Comment.findOne({
      _id: parentId,
      document: documentId,
      tenantId: req.user.tenantId,
    });

    if (!parentComment) {
      return next(new AppError('Parent comment not found', 404));
    }
  }

  // Create comment
  const comment = await Comment.create({
    tenantId: req.user.tenantId,
    document: documentId,
    author: req.user._id,
    content,
    parentId,
  });

  // Populate author
  await comment.populate('author', 'firstName lastName email');

  // Send notification to document owner
  if (document.uploadedBy._id.toString() !== req.user._id.toString()) {
    await sendCommentNotificationEmail(document.uploadedBy, document, comment, req.user);
  }

  // Log activity
  await log(req, 'comment_add', 'comment', comment._id, { documentId });

  res.status(201).json({
    status: 'success',
    data: {
      comment,
    },
  });
});

/**
 * Get comments for document
 */
exports.getComments = catchAsync(async (req, res, next) => {
  const { documentId } = req.params;
  const { page = 1, limit = 20 } = req.query;

  // Check if document exists and user has access
  const document = await Document.findOne({
    _id: documentId,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'view')) {
    return next(new AppError('You do not have permission to view comments on this document', 403));
  }

  // Get top-level comments (no parent)
  const comments = await Comment.find({
    document: documentId,
    tenantId: req.user.tenantId,
    parentId: null,
  })
    .populate('author', 'firstName lastName email')
    .populate({
      path: 'replies',
      populate: {
        path: 'author',
        select: 'firstName lastName email',
      },
    })
    .sort('-createdAt')
    .limit(limit * 1)
    .skip((page - 1) * limit);

  // Get total count
  const total = await Comment.countDocuments({
    document: documentId,
    tenantId: req.user.tenantId,
    parentId: null,
  });

  res.status(200).json({
    status: 'success',
    results: comments.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: {
      comments,
    },
  });
});

/**
 * Update comment
 */
exports.updateComment = catchAsync(async (req, res, next) => {
  const { content } = req.body;
  const { commentId } = req.params;

  const comment = await Comment.findOne({
    _id: commentId,
    tenantId: req.user.tenantId,
  });

  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  // Only author can update comment
  if (comment.author.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only edit your own comments', 403));
  }

  comment.content = content;
  comment.isEdited = true;
  await comment.save();

  await comment.populate('author', 'firstName lastName email');

  // Log activity
  await log(req, 'comment_update', 'comment', comment._id);

  res.status(200).json({
    status: 'success',
    data: {
      comment,
    },
  });
});

/**
 * Delete comment
 */
exports.deleteComment = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;

  const comment = await Comment.findOne({
    _id: commentId,
    tenantId: req.user.tenantId,
  });

  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  // Only author or admin can delete comment
  if (comment.author.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
    return next(new AppError('You can only delete your own comments', 403));
  }

  // Delete comment and its replies
  await Comment.deleteMany({
    $or: [
      { _id: commentId },
      { parentId: commentId },
    ],
  });

  // Log activity
  await log(req, 'comment_delete', 'comment', comment._id);

  res.status(200).json({
    status: 'success',
    message: 'Comment deleted successfully',
  });
});

/**
 * Add reaction to comment
 */
exports.addReaction = catchAsync(async (req, res, next) => {
  const { type } = req.body;
  const { commentId } = req.params;

  const comment = await Comment.findOne({
    _id: commentId,
    tenantId: req.user.tenantId,
  });

  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  // Check if user already reacted
  const existingReaction = comment.reactions.find(
    r => r.user.toString() === req.user._id.toString()
  );

  if (existingReaction) {
    // Update reaction type
    existingReaction.type = type;
  } else {
    // Add new reaction
    comment.reactions.push({
      user: req.user._id,
      type,
    });
  }

  await comment.save();

  res.status(200).json({
    status: 'success',
    data: {
      comment,
    },
  });
});

/**
 * Remove reaction from comment
 */
exports.removeReaction = catchAsync(async (req, res, next) => {
  const { commentId } = req.params;

  const comment = await Comment.findOne({
    _id: commentId,
    tenantId: req.user.tenantId,
  });

  if (!comment) {
    return next(new AppError('Comment not found', 404));
  }

  // Remove user's reaction
  comment.reactions = comment.reactions.filter(
    r => r.user.toString() !== req.user._id.toString()
  );

  await comment.save();

  res.status(200).json({
    status: 'success',
    data: {
      comment,
    },
  });
});

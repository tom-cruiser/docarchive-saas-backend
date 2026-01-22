const Document = require('../models/Document');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { uploadFile, downloadFile, deleteFile, getSignedUrl } = require('../config/wasabi');
const { log } = require('../middleware/activityLogger');
const { sendDocumentSharedEmail } = require('../services/emailService');
const sharp = require('sharp');

/**
 * Upload document
 */
exports.uploadDocument = catchAsync(async (req, res, next) => {
  if (!req.file) {
    return next(new AppError('Please provide a file to upload', 400));
  }

  const { name, description, category, tags, folderId } = req.body;

  // Process image if it's an image
  let fileBuffer = req.file.buffer;
  if (req.file.mimetype.startsWith('image/')) {
    fileBuffer = await sharp(req.file.buffer)
      .resize(2000, 2000, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
  }

  // Upload to Wasabi
  const fileKey = `${req.user.tenantId}/documents/${Date.now()}-${req.file.originalname}`;
  await uploadFile(fileKey, fileBuffer, req.file.mimetype);

  // Create document record
  const document = await Document.create({
    tenantId: req.user.tenantId,
    name: name || req.file.originalname,
    description,
    filename: req.file.originalname,
    fileKey,
    mimeType: req.file.mimetype,
    size: req.file.size,
    category,
    tags: tags ? tags.split(',').map(tag => tag.trim()) : [],
    folderId,
    uploadedBy: req.user._id,
    versions: [{
      version: 1,
      fileKey,
      size: req.file.size,
      uploadedBy: req.user._id,
      uploadedAt: Date.now(),
      changes: 'Initial upload',
    }],
  });

  // Log activity
  await log(req, 'document_upload', 'document', document._id, { documentName: document.name });

  res.status(201).json({
    status: 'success',
    data: {
      document,
    },
  });
});

/**
 * Get all documents
 */
exports.getAllDocuments = catchAsync(async (req, res, next) => {
  const {
    page = 1,
    limit = 20,
    search,
    category,
    tags,
    uploadedBy,
    folderId,
    sortBy = '-createdAt',
  } = req.query;

  // Build query
  const query = {
    tenantId: req.user.tenantId,
    isDeleted: false,
  };

  // Search
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
      { tags: { $regex: search, $options: 'i' } },
    ];
  }

  // Filter by category
  if (category) {
    query.category = category;
  }

  // Filter by tags
  if (tags) {
    query.tags = { $in: tags.split(',') };
  }

  // Filter by uploader
  if (uploadedBy) {
    query.uploadedBy = uploadedBy;
  }

  // Filter by folder
  if (folderId === 'null') {
    query.folderId = null;
  } else if (folderId) {
    query.folderId = folderId;
  }

  // Check permissions
  if (req.user.role !== 'admin') {
    query.$or = [
      { uploadedBy: req.user._id },
      { 'sharedWith.user': req.user._id },
      { visibility: 'public' },
    ];
  }

  // Execute query
  const documents = await Document.find(query)
    .populate('uploadedBy', 'firstName lastName email')
    .populate('sharedWith.user', 'firstName lastName email')
    .sort(sortBy)
    .limit(limit * 1)
    .skip((page - 1) * limit);

  // Get total count
  const total = await Document.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: documents.length,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / limit),
    data: {
      documents,
    },
  });
});

/**
 * Get document by ID
 */
exports.getDocument = catchAsync(async (req, res, next) => {
  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  })
    .populate('uploadedBy', 'firstName lastName email')
    .populate('sharedWith.user', 'firstName lastName email')
    .populate('accessLog.user', 'firstName lastName email');

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'view')) {
    return next(new AppError('You do not have permission to view this document', 403));
  }

  // Log access
  await document.logAccess(req.user._id, 'view');

  res.status(200).json({
    status: 'success',
    data: {
      document,
    },
  });
});

/**
 * Update document
 */
exports.updateDocument = catchAsync(async (req, res, next) => {
  const { name, description, category, tags, folderId, visibility } = req.body;

  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'edit')) {
    return next(new AppError('You do not have permission to edit this document', 403));
  }

  // Update fields
  if (name) document.name = name;
  if (description) document.description = description;
  if (category) document.category = category;
  if (tags) document.tags = tags.split(',').map(tag => tag.trim());
  if (folderId !== undefined) document.folderId = folderId;
  if (visibility) document.visibility = visibility;

  await document.save();

  // Log activity
  await log(req, 'document_update', 'document', document._id, { documentName: document.name });

  res.status(200).json({
    status: 'success',
    data: {
      document,
    },
  });
});

/**
 * Delete document (soft delete)
 */
exports.deleteDocument = catchAsync(async (req, res, next) => {
  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'delete')) {
    return next(new AppError('You do not have permission to delete this document', 403));
  }

  // Soft delete
  document.isDeleted = true;
  document.deletedAt = Date.now();
  document.deletedBy = req.user._id;
  await document.save();

  // Log activity
  await log(req, 'document_delete', 'document', document._id, { documentName: document.name });

  res.status(200).json({
    status: 'success',
    message: 'Document deleted successfully',
  });
});

/**
 * Permanently delete document
 */
exports.permanentDeleteDocument = catchAsync(async (req, res, next) => {
  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Only admin or document owner can permanently delete
  if (req.user.role !== 'admin' && document.uploadedBy.toString() !== req.user._id.toString()) {
    return next(new AppError('You do not have permission to permanently delete this document', 403));
  }

  // Delete from Wasabi
  await deleteFile(document.fileKey);

  // Delete all versions
  for (const version of document.versions) {
    if (version.fileKey !== document.fileKey) {
      await deleteFile(version.fileKey);
    }
  }

  // Delete from database
  await Document.deleteOne({ _id: document._id });

  // Log activity
  await log(req, 'document_permanent_delete', 'document', document._id, { documentName: document.name });

  res.status(200).json({
    status: 'success',
    message: 'Document permanently deleted',
  });
});

/**
 * Download document
 */
exports.downloadDocument = catchAsync(async (req, res, next) => {
  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'view')) {
    return next(new AppError('You do not have permission to download this document', 403));
  }

  // Get signed URL
  const signedUrl = await getSignedUrl(document.fileKey, document.filename);

  // Log access
  await document.logAccess(req.user._id, 'download');

  // Log activity
  await log(req, 'document_download', 'document', document._id, { documentName: document.name });

  res.status(200).json({
    status: 'success',
    data: {
      url: signedUrl,
    },
  });
});

/**
 * Share document
 */
exports.shareDocument = catchAsync(async (req, res, next) => {
  const { userId, permission, message } = req.body;

  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'share')) {
    return next(new AppError('You do not have permission to share this document', 403));
  }

  // Check if user exists in same tenant
  const userToShare = await User.findOne({
    _id: userId,
    tenantId: req.user.tenantId,
  });

  if (!userToShare) {
    return next(new AppError('User not found', 404));
  }

  // Check if already shared
  const existingShare = document.sharedWith.find(
    share => share.user.toString() === userId
  );

  if (existingShare) {
    // Update permission
    existingShare.permission = permission;
  } else {
    // Add new share
    document.sharedWith.push({
      user: userId,
      permission,
      sharedBy: req.user._id,
    });
  }

  await document.save();

  // Send email notification
  await sendDocumentSharedEmail(userToShare, document, req.user);

  // Log activity
  await log(req, 'document_share', 'document', document._id, {
    documentName: document.name,
    sharedWith: userToShare.email,
    permission,
  });

  res.status(200).json({
    status: 'success',
    message: 'Document shared successfully',
    data: {
      document,
    },
  });
});

/**
 * Unshare document
 */
exports.unshareDocument = catchAsync(async (req, res, next) => {
  const { userId } = req.params;

  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'share')) {
    return next(new AppError('You do not have permission to unshare this document', 403));
  }

  // Remove share
  document.sharedWith = document.sharedWith.filter(
    share => share.user.toString() !== userId
  );

  await document.save();

  // Log activity
  await log(req, 'document_unshare', 'document', document._id, { documentName: document.name });

  res.status(200).json({
    status: 'success',
    message: 'Document unshared successfully',
  });
});

/**
 * Get document versions
 */
exports.getVersions = catchAsync(async (req, res, next) => {
  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  }).populate('versions.uploadedBy', 'firstName lastName email');

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'view')) {
    return next(new AppError('You do not have permission to view this document', 403));
  }

  res.status(200).json({
    status: 'success',
    results: document.versions.length,
    data: {
      versions: document.versions,
    },
  });
});

/**
 * Restore document version
 */
exports.restoreVersion = catchAsync(async (req, res, next) => {
  const { versionNumber } = req.params;

  const document = await Document.findOne({
    _id: req.params.id,
    tenantId: req.user.tenantId,
    isDeleted: false,
  });

  if (!document) {
    return next(new AppError('Document not found', 404));
  }

  // Check permissions
  if (!document.canUserAccess(req.user._id, 'edit')) {
    return next(new AppError('You do not have permission to restore this document', 403));
  }

  // Find version
  const version = document.versions.find(v => v.version === parseInt(versionNumber));
  if (!version) {
    return next(new AppError('Version not found', 404));
  }

  // Create new version from restored version
  const newVersion = {
    version: document.versions.length + 1,
    fileKey: version.fileKey,
    size: version.size,
    uploadedBy: req.user._id,
    uploadedAt: Date.now(),
    changes: `Restored version ${versionNumber}`,
  };

  document.versions.push(newVersion);
  document.fileKey = version.fileKey;
  document.size = version.size;

  await document.save();

  // Log activity
  await log(req, 'document_restore_version', 'document', document._id, {
    documentName: document.name,
    versionNumber,
  });

  res.status(200).json({
    status: 'success',
    message: 'Version restored successfully',
    data: {
      document,
    },
  });
});

/**
 * Get document statistics
 */
exports.getStatistics = catchAsync(async (req, res, next) => {
  const stats = await Document.aggregate([
    {
      $match: {
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
        avgSize: { $avg: '$size' },
      },
    },
  ]);

  const categoryStats = await Document.aggregate([
    {
      $match: {
        tenantId: req.user.tenantId,
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        totalSize: { $sum: '$size' },
      },
    },
  ]);

  res.status(200).json({
    status: 'success',
    data: {
      overview: stats[0] || {
        totalDocuments: 0,
        totalSize: 0,
        avgSize: 0,
      },
      byCategory: categoryStats,
    },
  });
});

/**
 * Get dashboard stats for user
 */
exports.getDashboardStats = catchAsync(async (req, res, next) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now.setDate(now.getDate() - 7));

  // Build query for user's accessible documents
  const baseQuery = {
    tenantId: req.user.tenantId,
    isDeleted: false,
  };

  if (req.user.role !== 'Admin') {
    baseQuery.$or = [
      { uploadedBy: req.user._id },
      { 'sharedWith.user': req.user._id },
      { visibility: 'public' },
    ];
  }

  // Total documents
  const totalDocuments = await Document.countDocuments(baseQuery);

  // Documents uploaded this month
  const thisMonth = await Document.countDocuments({
    ...baseQuery,
    createdAt: { $gte: startOfMonth },
  });

  // Recent documents (last 7 days)
  const recent = await Document.countDocuments({
    ...baseQuery,
    createdAt: { $gte: startOfWeek },
  });

  // Get recent documents for display
  const recentDocuments = await Document.find(baseQuery)
    .populate('uploadedBy', 'firstName lastName email')
    .sort('-createdAt')
    .limit(6);

  res.status(200).json({
    status: 'success',
    data: {
      totalDocuments,
      thisMonth,
      recent,
      recentDocuments,
    },
  });
});

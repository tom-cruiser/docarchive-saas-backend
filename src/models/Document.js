const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  // Multi-tenant identifier
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  
  // Owner
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Document Information
  title: {
    type: String,
    required: [true, 'Document title is required'],
    trim: true,
  },
  description: {
    type: String,
    trim: true,
    default: '',
  },
  type: {
    type: String,
    enum: ['General', 'Contract', 'Legal', 'Academic', 'Financial', 'Personal', 'Other'],
    default: 'General',
  },
  
  // File Information
  fileName: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  mimeType: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  fileExtension: {
    type: String,
    required: true,
  },
  
  // Storage
  storageKey: {
    type: String,
    required: true,
    unique: true,
  },
  checksum: {
    type: String,
    required: true,
  },
  
  // Security
  encrypted: {
    type: Boolean,
    default: true,
  },
  encryptionAlgorithm: {
    type: String,
    default: 'AES256',
  },
  
  // Metadata
  tags: [{
    type: String,
    trim: true,
  }],
  category: {
    type: String,
    default: 'Uncategorized',
  },
  
  // Version Control
  version: {
    type: Number,
    default: 1,
  },
  versionHistory: [{
    version: Number,
    storageKey: String,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedAt: Date,
    changes: String,
    fileSize: Number,
  }],
  
  // Sharing and Permissions
  isShared: {
    type: Boolean,
    default: false,
  },
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    permission: {
      type: String,
      enum: ['view', 'edit', 'admin'],
      default: 'view',
    },
    sharedAt: {
      type: Date,
      default: Date.now,
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  }],
  
  // Status
  status: {
    type: String,
    enum: ['active', 'archived', 'deleted'],
    default: 'active',
  },
  
  // Folder/Organization
  folder: {
    type: String,
    default: 'root',
  },
  path: {
    type: String,
    default: '/',
  },
  
  // Soft Delete
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Access Tracking
  lastAccessedAt: Date,
  accessCount: {
    type: Number,
    default: 0,
  },
  downloadCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
documentSchema.index({ tenantId: 1, owner: 1 });
documentSchema.index({ tenantId: 1, status: 1 });
documentSchema.index({ tenantId: 1, isShared: 1 });
documentSchema.index({ tenantId: 1, type: 1 });
documentSchema.index({ tenantId: 1, createdAt: -1 });
documentSchema.index({ tenantId: 1, tags: 1 });
documentSchema.index({ 'sharedWith.user': 1 });

// Text search index
documentSchema.index({ 
  title: 'text', 
  description: 'text', 
  tags: 'text' 
});

// Virtual for file URL (using signed URL)
documentSchema.virtual('fileUrl').get(function() {
  // This will be generated dynamically when needed
  return null;
});

// Virtual for size in human-readable format
documentSchema.virtual('fileSizeFormatted').get(function() {
  const bytes = this.fileSize;
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
});

// Method to check if user has access
documentSchema.methods.hasAccess = function(userId, requiredPermission = 'view') {
  // Owner has full access
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  
  // Check shared permissions
  const sharedEntry = this.sharedWith.find(
    entry => entry.user.toString() === userId.toString()
  );
  
  if (!sharedEntry) return false;
  
  if (requiredPermission === 'view') {
    return ['view', 'edit', 'admin'].includes(sharedEntry.permission);
  }
  
  if (requiredPermission === 'edit') {
    return ['edit', 'admin'].includes(sharedEntry.permission);
  }
  
  if (requiredPermission === 'admin') {
    return sharedEntry.permission === 'admin';
  }
  
  return false;
};

// Increment access count
documentSchema.methods.incrementAccessCount = function() {
  this.accessCount += 1;
  this.lastAccessedAt = Date.now();
  return this.save();
};

// Increment download count
documentSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  return this.save();
};

module.exports = mongoose.model('Document', documentSchema);

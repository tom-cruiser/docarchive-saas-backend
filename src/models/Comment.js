const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
  // Multi-tenant identifier
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  
  // Document reference
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true,
    index: true,
  },
  
  // Author
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  
  // Comment content
  text: {
    type: String,
    required: [true, 'Comment text is required'],
    trim: true,
  },
  
  // Parent comment for threading
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null,
  },
  
  // Editing
  edited: {
    type: Boolean,
    default: false,
  },
  editedAt: Date,
  
  // Status
  status: {
    type: String,
    enum: ['active', 'deleted'],
    default: 'active',
  },
  
  // Reactions
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    type: {
      type: String,
      enum: ['like', 'love', 'helpful'],
    },
  }],
}, {
  timestamps: true,
});

// Indexes
commentSchema.index({ tenantId: 1, document: 1, createdAt: -1 });
commentSchema.index({ author: 1 });

module.exports = mongoose.model('Comment', commentSchema);

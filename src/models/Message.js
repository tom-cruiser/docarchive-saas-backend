const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Multi-tenant identifier
  tenantId: {
    type: String,
    required: true,
    index: true,
  },
  
  // User who sent the message
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // Message details
  subject: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  
  message: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Status
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'resolved', 'closed'],
    default: 'pending',
    index: true,
  },
  
  // Priority
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  
  // Admin response
  response: {
    type: String,
    trim: true,
  },
  
  respondedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  respondedAt: {
    type: Date,
  },
  
  // Category
  category: {
    type: String,
    enum: ['technical', 'billing', 'feature_request', 'bug_report', 'general', 'other'],
    default: 'general',
  },
  
  // Read status
  isRead: {
    type: Boolean,
    default: false,
    index: true,
  },
}, {
  timestamps: true,
});

// Indexes
messageSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
messageSchema.index({ user: 1, createdAt: -1 });
messageSchema.index({ status: 1, isRead: 1 });

module.exports = mongoose.model('Message', messageSchema);

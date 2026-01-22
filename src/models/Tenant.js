const mongoose = require('mongoose');

const tenantSchema = new mongoose.Schema({
  // Tenant identification
  tenantId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  name: {
    type: String,
    required: [true, 'Tenant name is required'],
    trim: true,
  },
  subdomain: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true,
  },
  
  // Admin user
  adminUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  
  // Settings
  settings: {
    maxUsers: {
      type: Number,
      default: 50,
    },
    maxStoragePerUser: {
      type: Number,
      default: 5368709120, // 5GB
    },
    totalStorageLimit: {
      type: Number,
      default: 107374182400, // 100GB
    },
    allowedFileTypes: [{
      type: String,
    }],
    features: {
      twoFactorAuth: {
        type: Boolean,
        default: true,
      },
      documentSharing: {
        type: Boolean,
        default: true,
      },
      versionControl: {
        type: Boolean,
        default: true,
      },
      comments: {
        type: Boolean,
        default: true,
      },
    },
  },
  
  // Usage statistics
  usage: {
    userCount: {
      type: Number,
      default: 0,
    },
    documentCount: {
      type: Number,
      default: 0,
    },
    storageUsed: {
      type: Number,
      default: 0,
    },
  },
  
  // Subscription
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'professional', 'enterprise'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'suspended', 'cancelled'],
      default: 'active',
    },
    startDate: Date,
    endDate: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String,
  },
  
  // Billing
  billing: {
    email: String,
    address: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      postalCode: String,
      country: String,
    },
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active',
  },
  
  // Custom branding
  branding: {
    logo: String,
    primaryColor: String,
    secondaryColor: String,
  },
}, {
  timestamps: true,
});

module.exports = mongoose.model('Tenant', tenantSchema);

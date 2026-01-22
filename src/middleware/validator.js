const Joi = require('joi');
const AppError = require('../utils/appError');

// Validation schemas
const schemas = {
  // User registration
  register: Joi.object({
    firstName: Joi.string().trim().min(2).max(50).required(),
    lastName: Joi.string().trim().min(2).max(50).required(),
    email: Joi.string().email().lowercase().required(),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .message('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    role: Joi.string().valid('Student', 'Notary', 'Teacher', 'Lawyer', 'Professional').default('Professional'),
    tenantId: Joi.string().optional(),
  }),

  // User login
  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
    twoFactorCode: Joi.string().length(6).optional(),
  }),

  // Password reset request
  forgotPassword: Joi.object({
    email: Joi.string().email().required(),
  }),

  // Reset password
  resetPassword: Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  }),

  // Update profile
  updateProfile: Joi.object({
    firstName: Joi.string().trim().min(2).max(50).optional(),
    lastName: Joi.string().trim().min(2).max(50).optional(),
    phone: Joi.string().trim().optional().allow(''),
    organization: Joi.string().trim().optional().allow(''),
    preferences: Joi.object({
      language: Joi.string().optional(),
      timezone: Joi.string().optional(),
      notifications: Joi.object({
        email: Joi.boolean().optional(),
        push: Joi.boolean().optional(),
      }).optional(),
    }).optional(),
  }),

  // Change password
  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).max(128).required()
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  }),

  // Document upload
  uploadDocument: Joi.object({
    title: Joi.string().trim().min(1).max(255).required(),
    description: Joi.string().trim().max(1000).optional().allow(''),
    type: Joi.string().valid('General', 'Contract', 'Legal', 'Academic', 'Financial', 'Personal', 'Other').default('General'),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    category: Joi.string().trim().optional(),
    folder: Joi.string().trim().optional(),
  }),

  // Update document
  updateDocument: Joi.object({
    title: Joi.string().trim().min(1).max(255).optional(),
    description: Joi.string().trim().max(1000).optional(),
    type: Joi.string().valid('General', 'Contract', 'Legal', 'Academic', 'Financial', 'Personal', 'Other').optional(),
    tags: Joi.array().items(Joi.string().trim()).optional(),
    category: Joi.string().trim().optional(),
    folder: Joi.string().trim().optional(),
  }),

  // Share document
  shareDocument: Joi.object({
    userEmail: Joi.string().email().required(),
    permission: Joi.string().valid('view', 'edit', 'admin').default('view'),
    message: Joi.string().max(500).optional(),
  }),

  // Add comment
  addComment: Joi.object({
    text: Joi.string().trim().min(1).max(1000).required(),
    parentComment: Joi.string().optional(),
  }),

  // Update comment
  updateComment: Joi.object({
    text: Joi.string().trim().min(1).max(1000).required(),
  }),
};

/**
 * Validate request body against schema
 */
const validate = (schema) => {
  return (req, res, next) => {
    // If schema is a string, look it up in schemas object
    let validationSchema = schema;
    if (typeof schema === 'string') {
      validationSchema = schemas[schema];
      if (!validationSchema) {
        return next(new AppError(`Validation schema '${schema}' not found`, 500));
      }
    }
    
    const { error } = validationSchema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      }));
      
      return next(new AppError('Validation failed', 400, errors));
    }

    next();
  };
};

module.exports = {
  validate,
  schemas,
};

const ActivityLog = require('../models/ActivityLog');
const logger = require('../utils/logger');

/**
 * Log user activity
 */
const logActivity = async (data) => {
  try {
    await ActivityLog.create(data);
  } catch (error) {
    logger.error('Failed to log activity:', error);
  }
};

/**
 * Middleware to log request
 */
exports.logRequest = (action, resourceType = null) => {
  return async (req, res, next) => {
    // Store original res.json
    const originalJson = res.json.bind(res);

    // Override res.json
    res.json = function(data) {
      // Log only on success
      if (res.statusCode < 400) {
        const logData = {
          tenantId: req.tenantId || 'system',
          user: req.user?._id,
          action,
          resourceType,
          resourceId: req.params.id || req.params.documentId || null,
          details: {
            method: req.method,
            url: req.originalUrl,
            query: req.query,
            body: sanitizeBody(req.body),
          },
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('user-agent'),
          status: 'success',
        };

        logActivity(logData);
      }

      // Call original json method
      return originalJson(data);
    };

    next();
  };
};

/**
 * Log specific activity
 */
exports.log = async (req, action, resourceType, resourceId, details = {}) => {
  // Don't log if no user (shouldn't happen for authenticated routes)
  if (!req.user?._id) {
    logger.warn('Attempted to log activity without user context');
    return;
  }

  const logData = {
    tenantId: req.tenantId || 'system',
    user: req.user._id,
    action,
    resourceType,
    resourceId,
    details,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    status: 'success',
  };

  await logActivity(logData);
};

/**
 * Log failed activity
 */
exports.logFailure = async (req, action, error, details = {}) => {
  // Don't log if no user context
  if (!req.user?._id) {
    logger.warn('Attempted to log failure without user context');
    return;
  }

  const logData = {
    tenantId: req.tenantId || 'system',
    user: req.user._id,
    action,
    details,
    ipAddress: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    status: 'failure',
    errorMessage: error.message,
  };

  await logActivity(logData);
};

/**
 * Sanitize request body for logging
 */
const sanitizeBody = (body) => {
  if (!body) return {};
  
  const sanitized = { ...body };
  const sensitiveFields = ['password', 'currentPassword', 'newPassword', 'token', 'twoFactorSecret'];
  
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });
  
  return sanitized;
};

const express = require('express');
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication and admin role
router.use(protect);
router.use(restrictTo('Admin'));

// Dashboard
router.get('/dashboard/stats', adminController.getDashboardStats);
router.get('/system/health', adminController.getSystemHealth);

// User Management
router.get('/users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserById);
router.patch('/users/:userId/deactivate', adminController.deactivateUser);
router.patch('/users/:userId/activate', adminController.activateUser);
router.patch('/users/:userId/role', adminController.updateUserRole);
router.delete('/users/:userId', adminController.deleteUser);

// Tenant Management
router.get('/tenants', adminController.getAllTenants);

// Activity Monitoring
router.get('/activities', adminController.getActivityLogs);

// Document Management
router.get('/documents', adminController.getAllDocuments);

module.exports = router;

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAdmin, logActivity } = require('../middleware/adminMiddleware');
const { csrfProtect } = require('../middleware/authMiddleware');


router.use(requireAdmin);


router.get('/', adminController.getDashboard);
router.get('/dashboard', adminController.getDashboard);


router.get('/users', adminController.getUsers);
router.post('/users/:id/edit', adminController.editUser);
router.post('/users/:id/block', adminController.blockUser);
router.post('/users/:id/unblock', adminController.unblockUser);


router.get('/works', adminController.getWorks);
router.post('/works/:id/moderate', adminController.moderateWork);
router.post('/works/:id/delete', csrfProtect, adminController.deleteWork);

router.post('/services/:id/delete', csrfProtect, adminController.deleteService);
router.post('/orders/:id/delete', csrfProtect, adminController.deleteOrder);

router.get('/complaints', adminController.getComplaints);
router.get('/complaints/:id', adminController.getComplaintDetail);
router.post('/complaints/:id/resolve', adminController.resolveComplaint);


router.get('/feedback', adminController.getFeedback);

router.get('/reviews', adminController.getReviews);
router.post('/reviews/:id/approve', csrfProtect, adminController.approveReview);
router.post('/reviews/:id/reject', csrfProtect, adminController.rejectReview);


router.get('/export', adminController.exportData);


router.get('/withdrawals', adminController.getWithdrawalsPage);


router.post('/settings', adminController.updateSettings);

module.exports = router;

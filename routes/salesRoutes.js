const express = require('express');
const router = express.Router();
const salesController = require('../controllers/salesController');

router.get('/dashboard', salesController.getDashboardPage);
router.get('/requests', salesController.getRequestsPage);
router.get('/warehouse', salesController.getWarehousePage);
router.get('/calendar', salesController.getCalendarPage); 

router.get('/api/:requestID/details', salesController.getRequestSidebarJson);
router.get('/api/partners', salesController.getPartnerJson);
router.get('/api/requests', salesController.getRequestJson);
router.put('/api/requests/:requestID/status', salesController.setRequestStatus);
router.put('/api/orders/:orderID/status', salesController.setOrderStatus);

module.exports = router;
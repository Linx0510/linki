const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { csrfProtect } = require('../middleware/authMiddleware');


router.get('/auth', authController.getAuthPage);


router.post('/register', csrfProtect, authController.register);


router.post('/login', csrfProtect, authController.login);


router.post('/logout', csrfProtect, authController.logout);

module.exports = router;
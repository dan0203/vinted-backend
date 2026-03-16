// Modules npm
const express = require('express');
const router = express.Router();
// Modules internes
const userController = require('../controllers/user.controller');

router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.get('/:id', userController.getOne);

module.exports = router;

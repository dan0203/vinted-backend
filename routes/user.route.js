const express = require('express');
const fileUpload = require('express-fileupload'); // makes multipart/form-data files available on req.files
const userController = require('../controllers/user.controller');
const isAuthenticated = require('../middlewares/isAuthenticated');

const router = express.Router();
const upload = fileUpload();

router.post('/signup', userController.signup);
router.post('/login', userController.login);
router.get('/:id', userController.getOne);
router.put('/:id', isAuthenticated, upload, userController.update);
router.patch('/:id', isAuthenticated, upload, userController.updatePartial);
router.delete('/:id', isAuthenticated, userController.remove);

module.exports = router;

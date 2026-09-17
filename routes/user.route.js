const express = require('express');
const fileUpload = require('express-fileupload'); // makes multipart/form-data files available on req.files
const userController = require('../controllers/user.controller');
const isAuthenticated = require('../middlewares/isAuthenticated');
const authLimiter = require('../middlewares/authLimiter');

const router = express.Router();
const upload = fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
    preserveExtension: true,
});

router.post('/signup', authLimiter, userController.signup);
router.post('/login', authLimiter, userController.login);
router.get('/confirm/:token', userController.confirmEmail);
router.post('/confirm/resend', authLimiter, userController.resendConfirmation);
router.get('/:id', userController.getOne);
router.put('/:id', isAuthenticated, upload, userController.update);
router.patch('/:id', isAuthenticated, upload, userController.updatePartial);
router.delete('/:id', isAuthenticated, userController.remove);
router.get('/:id/favorites', isAuthenticated, userController.getFavorites);
router.post(
    '/:id/favorites/:offerId',
    isAuthenticated,
    userController.addFavorite
);
router.delete(
    '/:id/favorites/:offerId',
    isAuthenticated,
    userController.removeFavorite
);

module.exports = router;

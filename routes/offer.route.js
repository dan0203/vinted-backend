const express = require('express');
const fileUpload = require('express-fileupload'); // makes multipart/form-data files available on req.files
const offerController = require('../controllers/offer.controller');
const isAuthenticated = require('../middlewares/isAuthenticated');

const router = express.Router();
const upload = fileUpload({
    limits: { fileSize: 5 * 1024 * 1024 },
    abortOnLimit: true,
    safeFileNames: true,
    preserveExtension: true,
});

router.post('/publish', isAuthenticated, upload, offerController.publish);
router.get('/', offerController.getAll);
router.get('/:id', offerController.getOne);
router.put('/:id', isAuthenticated, upload, offerController.update);
router.patch('/:id', isAuthenticated, upload, offerController.updatePartial);
router.delete('/:id', isAuthenticated, offerController.remove);

module.exports = router;

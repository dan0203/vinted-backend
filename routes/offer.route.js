// Modules npm
const express = require('express');
const router = express.Router();
const fileUpload = require('express-fileupload'); // rendre les formdata lisibles à nos routes
// Module internes
const offerController = require('../controllers/offer.controller');
const isAuthenticated = require('../middlewares/isAuthenticated');

const upload = fileUpload();

router.post('/publish', isAuthenticated, upload, offerController.publish);
router.get('/', offerController.getAll);
router.get('/:id', offerController.getOne);
router.put('/:id', isAuthenticated, upload, offerController.update);
router.delete('/:id', isAuthenticated, offerController.remove);

module.exports = router;

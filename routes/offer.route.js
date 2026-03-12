// Server
const express = require('express');
const router = express.Router();
// Controller
const offerController = require('../controllers/offer.controller');
// Middleware
const isAuthenticated = require('../middlewares/isAuthenticated');
// import de fileupload, package qui permet via un middleware de rendre les formdata lisibles à nos routes
const fileUpload = require('express-fileupload');

router.post('/publish', isAuthenticated, fileUpload(), offerController.publish);
router.get('/', offerController.getAll);
router.get('/:id', offerController.getOne);
router.put('/:id', isAuthenticated, fileUpload(), offerController.update);
router.delete('/:id', isAuthenticated, offerController.remove);

module.exports = router;

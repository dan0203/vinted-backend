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

/**
 * @openapi
 * /offers/publish:
 *   post:
 *     summary: Publish a new offer
 *     tags: [Offers]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, price, brand, size, color, condition, city, picture]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               price: { type: number, minimum: 0, exclusiveMinimum: true }
 *               brand: { type: string }
 *               size: { type: string }
 *               color: { type: string }
 *               condition: { type: string }
 *               city: { type: string }
 *               picture: { type: string, format: binary, description: Main picture, required }
 *               pictures:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string, format: binary }
 *                 description: Up to 5 secondary pictures
 *     responses:
 *       201:
 *         description: Offer published
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Validation error, or too many pictures
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/publish', isAuthenticated, upload, offerController.publish);

/**
 * @openapi
 * /offers:
 *   get:
 *     summary: List offers
 *     description: Sold offers are excluded by default.
 *     tags: [Offers]
 *     parameters:
 *       - in: query
 *         name: title
 *         schema: { type: string }
 *         description: Case-insensitive substring match on the offer title
 *       - in: query
 *         name: priceMin
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: priceMax
 *         schema: { type: number, minimum: 0 }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [price-asc, price-desc], default: price-asc }
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *         description: 20 offers per page
 *     responses:
 *       200:
 *         description: Paginated offer list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count: { type: integer }
 *                 page: { type: integer }
 *                 totalPages: { type: integer }
 *                 offers:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Validation error (e.g. priceMin greater than priceMax)
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/', offerController.getAll);

/**
 * @openapi
 * /offers/{id}:
 *   get:
 *     summary: Get a single offer
 *     tags: [Offers]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Offer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Invalid offer id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Offer does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   put:
 *     summary: Replace an offer (owner only)
 *     description: Same body as publish - the full set of fields is required, `picture` included; omitting `pictures` clears the secondary images.
 *     tags: [Offers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, description, price, brand, size, color, condition, city, picture]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               price: { type: number, minimum: 0, exclusiveMinimum: true }
 *               brand: { type: string }
 *               size: { type: string }
 *               color: { type: string }
 *               condition: { type: string }
 *               city: { type: string }
 *               picture: { type: string, format: binary }
 *               pictures:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Replaced offer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Validation error, invalid offer id, or too many pictures
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Offer does not exist or does not belong to the authenticated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   patch:
 *     summary: Partially update an offer (owner only)
 *     description: Send only the fields that change. `pictures`, if sent, replaces the whole secondary-image set; `picture` and `pictures` are independent of one another.
 *     tags: [Offers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               price: { type: number, minimum: 0, exclusiveMinimum: true }
 *               brand: { type: string }
 *               size: { type: string }
 *               color: { type: string }
 *               condition: { type: string }
 *               city: { type: string }
 *               status: { type: string, enum: [available, reserved, sold] }
 *               picture: { type: string, format: binary }
 *               pictures:
 *                 type: array
 *                 maxItems: 5
 *                 items: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated offer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Validation error, invalid offer id, too many pictures, or no data was sent
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Offer does not exist or does not belong to the authenticated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   delete:
 *     summary: Delete an offer (owner only)
 *     description: Also deletes all of its Cloudinary images and removes it from other users' favorites.
 *     tags: [Offers]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted offer
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Offer' }
 *       400:
 *         description: Invalid offer id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: Offer does not exist or does not belong to the authenticated user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', offerController.getOne);
router.put('/:id', isAuthenticated, upload, offerController.update);
router.patch('/:id', isAuthenticated, upload, offerController.updatePartial);
router.delete('/:id', isAuthenticated, offerController.remove);

module.exports = router;

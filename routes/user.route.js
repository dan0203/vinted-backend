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

/**
 * @openapi
 * /users/signup:
 *   post:
 *     summary: Create an account
 *     description: The account starts inactive; login is blocked until the emailed confirmation link is followed.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, username]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *               username: { type: string, minLength: 2, maxLength: 30 }
 *               newsletter: { type: boolean }
 *     responses:
 *       201:
 *         description: Account created. Also sets a `refreshToken` httpOnly cookie.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 accessToken: { type: string, description: 'Short-lived JWT, expires in 15 minutes' }
 *                 account:
 *                   type: object
 *                   properties:
 *                     username: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: An account already exists with this email address
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/signup', authLimiter, userController.signup);

/**
 * @openapi
 * /users/login:
 *   post:
 *     summary: Log in
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Logged in. Also sets a `refreshToken` httpOnly cookie.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 _id: { type: string }
 *                 accessToken: { type: string, description: 'Short-lived JWT, expires in 15 minutes' }
 *                 account:
 *                   type: object
 *                   properties:
 *                     username: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Invalid credentials, or the account hasn't been confirmed yet
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       423:
 *         description: Account locked after too many failed login attempts
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/login', authLimiter, userController.login);

/**
 * @openapi
 * /users/refresh:
 *   post:
 *     summary: Get a new access token from the refresh cookie
 *     description: Reads the `refreshToken` httpOnly cookie set by signup/login/refresh, rotates it, and issues a new short-lived access token. There is no request body - the refresh token travels only as a cookie, never in JSON.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: New access token issued. Also rotates the `refreshToken` cookie.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken: { type: string }
 *       401:
 *         description: Missing, unknown, expired, or already-rotated-out refresh cookie
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/refresh', authLimiter, userController.refresh);

/**
 * @openapi
 * /users/logout:
 *   post:
 *     summary: End the current session
 *     description: Clears the `refreshToken` cookie and, if it matched a live session, invalidates it server-side. Always responds 200, even with no cookie at all.
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Logged out
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 */
router.post('/logout', authLimiter, userController.logout);

/**
 * @openapi
 * /users/confirm/{token}:
 *   get:
 *     summary: Confirm an account from the link sent by signup/resend
 *     description: Activates the account and, if `newsletter` was `true` at signup, sends a newsletter welcome email.
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Account confirmed
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid or expired confirmation link
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/confirm/:token', userController.confirmEmail);

/**
 * @openapi
 * /users/confirm/resend:
 *   post:
 *     summary: Re-send a confirmation email for an existing, not-yet-active account
 *     description: Always responds `200` with the same message regardless of whether the email is unknown, already active, or genuinely re-sent - this endpoint never reveals account existence or confirmation status.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Confirmation email sent (or silently skipped)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/confirm/resend', authLimiter, userController.resendConfirmation);

/**
 * @openapi
 * /users/reset/request:
 *   post:
 *     summary: Request a password reset code by email
 *     description: Always responds `200` with the same message regardless of whether the email is known - this endpoint never reveals account existence.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: Password reset email sent (or silently skipped)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/reset/request', authLimiter, userController.requestPasswordReset);

/**
 * @openapi
 * /users/reset/confirm:
 *   post:
 *     summary: Set a new password from a reset code sent by reset/request
 *     description: Invalidates any previously issued bearer token.
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, password]
 *             properties:
 *               token: { type: string }
 *               password: { type: string, minLength: 6 }
 *     responses:
 *       200:
 *         description: Password reset
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *       400:
 *         description: Validation error, or invalid/expired reset link
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/reset/confirm', authLimiter, userController.confirmPasswordReset);

/**
 * @openapi
 * /users/{id}:
 *   get:
 *     summary: Get a user's public profile
 *     tags: [Users]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User profile
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid user id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   put:
 *     summary: Replace a user's profile (self only)
 *     description: Omitting `avatar` leaves it unchanged, it's never cleared implicitly.
 *     tags: [Users]
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
 *             required: [username]
 *             properties:
 *               username: { type: string, minLength: 2, maxLength: 30 }
 *               newsletter: { type: boolean }
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated user profile
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   patch:
 *     summary: Partially update a user's profile (self only)
 *     description: Send only `username`, `avatar` and/or `newsletter`.
 *     tags: [Users]
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
 *               username: { type: string, minLength: 2, maxLength: 30 }
 *               newsletter: { type: boolean }
 *               avatar: { type: string, format: binary }
 *     responses:
 *       200:
 *         description: Updated user profile
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Validation error, or no data was sent
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   delete:
 *     summary: Delete a user's own account (self only)
 *     description: Cascades to all of the user's owned offers and their Cloudinary images.
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted user profile
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/User' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id', userController.getOne);
router.put('/:id', isAuthenticated, upload, userController.update);
router.patch('/:id', isAuthenticated, upload, userController.updatePartial);
router.delete('/:id', isAuthenticated, userController.remove);

/**
 * @openapi
 * /users/{id}/favorites:
 *   get:
 *     summary: List a user's favorited offers (self only)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Favorited offers
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 favorites:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Offer' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/:id/favorites', isAuthenticated, userController.getFavorites);

/**
 * @openapi
 * /users/{id}/favorites/{offerId}:
 *   post:
 *     summary: Add an offer to a user's favorites (self only)
 *     description: Idempotent - favoriting an already-favorited offer is a no-op.
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated favorites list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 favorites:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Invalid offer id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User or offer does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *   delete:
 *     summary: Remove an offer from a user's favorites (self only)
 *     description: Idempotent - removing a non-favorited offer is a no-op.
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: offerId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Updated favorites list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 favorites:
 *                   type: array
 *                   items: { type: string }
 *       400:
 *         description: Invalid offer id
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Authenticated user is not this account's owner
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404:
 *         description: User does not exist
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

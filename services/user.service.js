const Joi = require('joi');
const bcrypt = require('bcryptjs');
const uid2 = require('uid2');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Offer = require('../models/Offer');
const offerService = require('./offer.service');
const throwError = require('../utils/throwError');
const assertValidObjectId = require('../utils/assertValidObjectId');
const { uploadAvatar } = require('../utils/cloudinary');
const {
    safeRemoveImage,
    safeDeleteFolder,
    withImageRollback,
} = require('../utils/cloudinaryCleanup');
const {
    findByIdOrThrow,
    findByIdAndUpdateOrThrow,
    findOneAndDeleteOrThrow,
} = require('../utils/mongooseOrThrow');
const {
    sendConfirmationEmail,
    sendNewsletterWelcomeEmail,
    sendPasswordResetEmail,
} = require('../utils/email');
const {
    USER,
    OFFER,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_MS,
    MAX_LOGIN_ATTEMPTS,
    ACCOUNT_LOCK_MS,
    CONFIRMATION_TOKEN_TTL_MS,
    RESET_TOKEN_TTL_MS,
} = require('../utils/constants');

const signupSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    username: Joi.string().min(2).max(30).required(),
    newsletter: Joi.boolean(),
});

const loginSchema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
});

const resendConfirmationSchema = Joi.object({
    email: Joi.string().email().required(),
});

const confirmEmailSchema = Joi.object({
    token: Joi.string().required(),
});

const requestPasswordResetSchema = Joi.object({
    email: Joi.string().email().required(),
});

const confirmPasswordResetSchema = Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(6).required(),
});

function issueConfirmationToken(user) {
    user.confirmationToken = uid2(32);
    user.confirmationTokenExpiresAt = new Date(
        Date.now() + CONFIRMATION_TOKEN_TTL_MS
    );
}

// Mints a short-lived JWT access token and a rotating refresh token, storing
// the refresh token on the user document (caller still has to save() it) and
// returning the access token. One active refresh token per user at a time,
// same shape the previous opaque bearer token had - not a per-device list.
function issueSessionTokens(user) {
    user.refreshToken = uid2(16);
    user.refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL,
    });
}

// username/newsletter only: email and password aren't modified through
// these routes. avatar (file) is validated separately, like picture/pictures
// on the offer side — Joi doesn't apply well to express-fileupload file objects.
const userBodySchema = Joi.object({
    username: Joi.string().trim().min(2).max(30).required(),
    newsletter: Joi.boolean(),
}).required();

const userBodyPartialSchema = Joi.object({
    username: Joi.string().trim().min(2).max(30),
    newsletter: Joi.boolean(),
});

const updateOptions = { returnDocument: 'after', runValidators: true };

const favoritesPopulate = {
    path: 'favorites',
    populate: {
        path: 'owner',
        select: '_id account',
    },
};

// Validates `value` against `schema` and returns the validated version (with
// Joi's type conversions, e.g. trim), or throws a 400.
function assertValid(schema, value) {
    const { error, value: validated } = schema.validate(value);
    if (error) {
        throwError(error.details[0].message, 400);
    }
    return validated;
}

// Deliberately omits `active`: this DTO backs the public GET /users/:id as
// well as the authenticated update/remove routes, and confirmation status
// isn't meant to be learnable by an arbitrary caller who knows an id.
function toUserDTO(user) {
    return {
        _id: user._id,
        account: {
            username: user.account.username,
            avatar: user.account.avatar,
        },
        newsletter: user.newsletter,
    };
}

// The id in the URL must be the authenticated user's own: unlike offers,
// GET /users/:id is public (the profile isn't secret), so hiding an
// account's existence via 404 wouldn't achieve anything here — 403 is the
// most accurate code for "authenticated but not the right account".
function assertIsSelf(id, user) {
    assertValidObjectId(id, USER);
    if (id !== String(user._id)) {
        throwError('Unauthorized', 403);
    }
}

const signup = async (data) => {
    const { error } = signupSchema.validate(data);
    if (error) {
        throwError(error.details[0].message, 400);
    }

    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
        throwError('An account already exists with this email address', 409);
    }

    const hash = await bcrypt.hash(data.password, 10);

    const newUser = new User({
        email: data.email,
        account: {
            username: data.username,
        },
        newsletter: data.newsletter,
        hash,
    });
    const accessToken = issueSessionTokens(newUser);
    issueConfirmationToken(newUser);

    await newUser.save();

    // Fire-and-forget: never awaited, so a slow/hanging Resend call can't
    // hold this response open. utils/email.js swallows its own failures.
    sendConfirmationEmail(newUser.email, newUser.confirmationToken);

    return {
        _id: newUser._id,
        accessToken,
        refreshToken: newUser.refreshToken,
        refreshTokenExpiresAt: newUser.refreshTokenExpiresAt,
        account: {
            username: newUser.account.username,
        },
    };
};

const login = async (data) => {
    const { error } = loginSchema.validate(data);
    if (error) {
        throwError(error.details[0].message, 400);
    }

    const user = await User.findOne({ email: data.email });
    if (!user) {
        throwError('Unauthorized', 403);
    }

    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
        throwError('Account locked, please try again later', 423);
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.hash);
    if (!isPasswordValid) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
            user.lockUntil = new Date(Date.now() + ACCOUNT_LOCK_MS);
            user.failedLoginAttempts = 0;
        }
        await user.save();
        throwError('Unauthorized', 403);
    }

    if (!user.active) {
        throwError('Please confirm your email address before logging in', 403);
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    const accessToken = issueSessionTokens(user);
    await user.save();

    return {
        _id: user._id,
        accessToken,
        refreshToken: user.refreshToken,
        refreshTokenExpiresAt: user.refreshTokenExpiresAt,
        account: {
            username: user.account.username,
        },
    };
};

// Rotates the refresh token on every use: the presented value is replaced
// immediately, so presenting it again afterward is indistinguishable from
// any other unrecognized refresh token (401), which is this codebase's
// existing single-active-session model, not a per-device session list.
const refresh = async (data) => {
    const token = data.cookies?.refreshToken;
    if (!token) {
        throwError('Unauthorized', 401);
    }

    const user = await User.findOne({
        refreshToken: token,
        refreshTokenExpiresAt: { $gt: new Date() },
    });
    if (!user) {
        throwError('Unauthorized', 401);
    }

    const accessToken = issueSessionTokens(user);
    await user.save();

    return {
        accessToken,
        refreshToken: user.refreshToken,
        refreshTokenExpiresAt: user.refreshTokenExpiresAt,
    };
};

// Best effort: an unknown/already-invalid cookie value is not an error, and
// logging out with no cookie at all still succeeds - the caller's goal (no
// live session) is already satisfied either way.
const logout = async (data) => {
    const token = data.cookies?.refreshToken;
    if (token) {
        await User.updateOne(
            { refreshToken: token },
            { refreshToken: null, refreshTokenExpiresAt: null }
        );
    }

    return { message: 'Logged out' };
};

const confirmEmail = async (data) => {
    data = assertValid(confirmEmailSchema, data);

    const user = await User.findOneAndUpdate(
        {
            confirmationToken: data.token,
            confirmationTokenExpiresAt: { $gt: new Date() },
        },
        {
            active: true,
            confirmationToken: null,
            confirmationTokenExpiresAt: null,
        },
        { returnDocument: 'after' }
    );
    if (!user) {
        throwError('Invalid or expired confirmation link', 400);
    }

    if (user.newsletter === true) {
        sendNewsletterWelcomeEmail(user.email);
    }

    // Included here only: the caller already proved ownership by holding
    // the one-time token, unlike the generic DTO other routes return.
    return { ...toUserDTO(user), active: user.active };
};

// Always responds the same way regardless of whether the email is unknown,
// already active, or genuinely inactive: an unauthenticated caller must not
// be able to learn account existence or confirmation status from this
// endpoint. Only the real inactive-account case rotates the token and sends
// mail; the other two are a silent no-op.
const resendConfirmation = async (data) => {
    data = assertValid(resendConfirmationSchema, data);

    const user = await User.findOne({ email: data.email });
    if (user && !user.active) {
        issueConfirmationToken(user);
        await user.save();

        sendConfirmationEmail(user.email, user.confirmationToken);
    }

    return { message: 'Confirmation email sent' };
};

// Same anti-enumeration shape as resendConfirmation: always the same
// response, and only a genuine match rotates a token and sends mail.
const requestPasswordReset = async (data) => {
    data = assertValid(requestPasswordResetSchema, data);

    const user = await User.findOne({ email: data.email });
    if (user) {
        user.resetToken = uid2(32);
        user.resetTokenExpiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
        await user.save();

        sendPasswordResetEmail(user.email, user.resetToken);
    }

    return { message: 'Password reset email sent' };
};

// Checks the token before hashing the new password, so an invalid/expired
// attempt doesn't pay for a bcrypt round it can't use. The final write still
// filters on the token itself (not just _id), so a second request racing on
// the same now-consumed token still gets the same 400 instead of a second
// successful reset. Clearing the refresh token invalidates any session
// started before the reset (a still-live access token simply expires within
// ACCESS_TOKEN_TTL), and clearing the lockout fields means a legitimate
// reset isn't blocked by a stale failed-login lock.
const confirmPasswordReset = async (data) => {
    data = assertValid(confirmPasswordResetSchema, data);

    const tokenFilter = {
        resetToken: data.token,
        resetTokenExpiresAt: { $gt: new Date() },
    };
    const candidate = await User.findOne(tokenFilter);
    if (!candidate) {
        throwError('Invalid or expired reset link', 400);
    }

    const hash = await bcrypt.hash(data.password, 10);

    const user = await User.findOneAndUpdate(
        tokenFilter,
        {
            hash,
            resetToken: null,
            resetTokenExpiresAt: null,
            refreshToken: null,
            refreshTokenExpiresAt: null,
            failedLoginAttempts: 0,
            lockUntil: null,
        },
        updateOptions
    );
    if (!user) {
        throwError('Invalid or expired reset link', 400);
    }

    return { message: 'Password has been reset' };
};

const getOne = async (data) => {
    assertValidObjectId(data.id, USER);

    const user = await findByIdOrThrow(User, data.id, USER);

    return toUserDTO(user);
};

// Full replacement (PUT): username required, like the rest of the body.
// avatar remains a special case — it's a single optional field (not an
// array like "pictures" on the offer side), so unlike the full-replace of
// offers which clears "pictures" when absent, here the avatar is only
// replaced if it's explicitly sent: changing the username must never
// silently wipe the avatar.
const update = async (data) => {
    assertIsSelf(data.params.id, data.user);
    data.body = assertValid(userBodySchema, data.body);

    return applyUserUpdate(data);
};

const updatePartial = async (data) => {
    const hasBody = !!data.body;
    const hasAvatar = !!(data.files && data.files.avatar);

    if (!hasBody && !hasAvatar) {
        throwError('No data was sent', 400);
    }

    assertIsSelf(data.params.id, data.user);
    if (hasBody) {
        data.body = assertValid(userBodyPartialSchema, data.body);
    }

    return applyUserUpdate(data);
};

// Shared between update() and updatePartial(): builds the fields to
// change, uploads the new avatar if there is one (with rollback if the
// update fails), then deletes the old avatar once the update succeeds.
async function applyUserUpdate(data) {
    const updateFields = {};

    if (data.body?.username !== undefined) {
        updateFields['account.username'] = data.body.username;
    }
    if (data.body?.newsletter !== undefined) {
        updateFields.newsletter = data.body.newsletter;
    }

    const currentUser = await findByIdOrThrow(User, data.params.id, USER);

    const avatar = await uploadAvatar(data.files, data.params.id);
    if (avatar !== undefined) {
        updateFields['account.avatar'] = avatar;
    }

    const updatedUser = await withImageRollback([avatar].filter(Boolean), () =>
        findByIdAndUpdateOrThrow(
            User,
            data.params.id,
            USER,
            { $set: updateFields },
            updateOptions
        )
    );

    if (avatar !== undefined) {
        await safeRemoveImage(
            currentUser.account.avatar?.public_id,
            'Failed removing old avatar'
        );
    }

    return toUserDTO(updatedUser);
}

// The offer-deletion cascade (issue #1) isn't optional: no orphaned offer
// should be left with an owner that no longer exists.
const remove = async (data) => {
    assertIsSelf(data.params.id, data.user);

    const removedUser = await findOneAndDeleteOrThrow(
        User,
        { _id: data.params.id },
        USER
    );

    await offerService.removeAllByOwner(removedUser._id);

    await safeRemoveImage(
        removedUser.account.avatar?.public_id,
        'Failed removing avatar'
    );
    await safeDeleteFolder(
        `vinted/users/${removedUser._id}`,
        'Failed deleting user folder'
    );

    return toUserDTO(removedUser);
};

// Adds an offer to the caller's own favorites. $addToSet keeps this
// idempotent: favoriting an already-favorited offer is a no-op.
const addFavorite = async (data) => {
    assertIsSelf(data.params.id, data.user);
    assertValidObjectId(data.params.offerId, OFFER);

    await findByIdOrThrow(Offer, data.params.offerId, OFFER);

    const updatedUser = await findByIdAndUpdateOrThrow(
        User,
        data.params.id,
        USER,
        { $addToSet: { favorites: data.params.offerId } },
        updateOptions
    );

    return { favorites: updatedUser.favorites };
};

// Removes an offer from the caller's own favorites. $pull keeps this
// idempotent: removing a non-favorited offer is a no-op, not an error, so
// unlike addFavorite() there's no existence check on the offer id.
const removeFavorite = async (data) => {
    assertIsSelf(data.params.id, data.user);
    assertValidObjectId(data.params.offerId, OFFER);

    const updatedUser = await findByIdAndUpdateOrThrow(
        User,
        data.params.id,
        USER,
        { $pull: { favorites: data.params.offerId } },
        updateOptions
    );

    return { favorites: updatedUser.favorites };
};

const getFavorites = async (data) => {
    assertIsSelf(data.params.id, data.user);

    const user = await findByIdOrThrow(
        User,
        data.params.id,
        USER,
        favoritesPopulate
    );

    // populate() leaves null for a favorited offer that no longer exists
    // (e.g. deleted through a path that bypasses offer.service.js's
    // favorites cascade); filter it out instead of crashing the whole list.
    return {
        favorites: user.favorites.filter(Boolean).map(offerService.toOfferDTO),
    };
};

module.exports = {
    signup,
    login,
    refresh,
    logout,
    confirmEmail,
    resendConfirmation,
    requestPasswordReset,
    confirmPasswordReset,
    getOne,
    update,
    updatePartial,
    remove,
    addFavorite,
    removeFavorite,
    getFavorites,
};

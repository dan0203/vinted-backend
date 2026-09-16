const Joi = require('joi');
const bcrypt = require('bcryptjs');
const uid2 = require('uid2');
const User = require('../models/User');
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
const { USER } = require('../utils/constants');

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

// Validates `value` against `schema` and returns the validated version (with
// Joi's type conversions, e.g. trim), or throws a 400.
function assertValid(schema, value) {
    const { error, value: validated } = schema.validate(value);
    if (error) {
        throwError(error.details[0].message, 400);
    }
    return validated;
}

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
    const token = uid2(16);

    const newUser = new User({
        email: data.email,
        account: {
            username: data.username,
        },
        newsletter: data.newsletter,
        hash,
        token,
    });

    await newUser.save();

    return {
        _id: newUser._id,
        token: newUser.token,
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

    const isPasswordValid = await bcrypt.compare(data.password, user.hash);
    if (!isPasswordValid) {
        throwError('Unauthorized', 403);
    }

    return {
        _id: user._id,
        token: user.token,
        account: {
            username: user.account.username,
        },
    };
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

module.exports = { signup, login, getOne, update, updatePartial, remove };

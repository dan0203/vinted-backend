// Modules npm
const Joi = require('joi');
// Model
const User = require('../models/User');
// Encryption
const bcrypt = require('bcryptjs');
const uid2 = require('uid2');
// Service
const offerService = require('./offer.service');
// Utils
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

// Dans ce service, la validation des données se fait grâce au package Joi, comparé à offer service où on les effectue manuellement

// Schémas des formats attendus
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

// username/newsletter uniquement : email et password ne se modifient pas via
// ces routes. avatar (fichier) est validé à part, comme picture/pictures
// côté offer — Joi ne s'applique pas bien aux objets fichier d'express-fileupload.
const userBodySchema = Joi.object({
    username: Joi.string().trim().min(2).max(30).required(),
    newsletter: Joi.boolean(),
}).required();

const userBodyPartialSchema = Joi.object({
    username: Joi.string().trim().min(2).max(30),
    newsletter: Joi.boolean(),
});

const updateOptions = { returnDocument: 'after', runValidators: true };

// Valide `value` contre `schema` et renvoie la version validée (avec les
// conversions de type Joi, ex. trim), ou lève une 400.
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

// L'id dans l'URL doit être celui de l'utilisateur authentifié : contrairement
// aux offres, GET /users/:id est public (le profil n'est pas secret), donc
// cacher l'existence d'un compte via 404 n'apporterait rien ici — 403 est le
// code le plus juste pour "authentifié mais pas le bon compte".
function assertIsSelf(id, user) {
    assertValidObjectId(id, USER);
    if (id !== String(user._id)) {
        throwError('Unauthorized', 403);
    }
}

const signup = async (data) => {
    // Si les données fournies ne correspondent pas au format attendu
    const { error } = signupSchema.validate(data);
    if (error) {
        throwError(error.details[0].message, 400);
    }

    // Si un compte existe déjà avec cette adresse email
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
        throwError('An account already exists with this email address', 409);
    }

    // Si les informations fournies sont validées,
    //  on crée les éléments manquants (hash, token)
    //  et on enregistre le newUser dans la bdd
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
    // Si les données fournies ne correspondent pas au format attendu
    const { error } = loginSchema.validate(data);
    if (error) {
        throwError(error.details[0].message, 400);
    }

    // Récupérer en bdd le user correspondant à l'email
    const user = await User.findOne({ email: data.email });

    // S'il n'existe pas, erreur
    if (!user) {
        throwError('Unauthorized', 403);
    }

    // S'il existe, tester la crypto
    const isPasswordValid = await bcrypt.compare(data.password, user.hash);

    // Si c'est KO, erreur
    if (!isPasswordValid) {
        throwError('Unauthorized', 403);
    }

    // Si c'est OK, on retourne l'élément (_id, token, account.username)
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

// Remplacement complet (PUT) : username requis, comme le reste du body.
// avatar reste un cas à part — c'est un champ optionnel unique (pas un
// tableau comme "pictures" côté offer), donc contrairement au full-replace
// des offres qui vide "pictures" si absent, ici on ne remplace l'avatar que
// s'il est explicitement envoyé : modifier son username ne doit jamais
// effacer silencieusement son avatar.
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

// Partagé entre update() et updatePartial() : construit les champs à
// modifier, upload le nouvel avatar s'il y en a un (avec rollback si
// l'update échoue), puis supprime l'ancien avatar une fois l'update réussi.
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

// La cascade de suppression des offres (issue #1) n'est pas optionnelle :
// pas d'offre orpheline avec un owner qui n'existe plus.
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

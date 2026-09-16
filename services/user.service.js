// Modules npm
const Joi = require('joi');
// Model
const User = require('../models/User');
// Encryption
const bcrypt = require('bcryptjs');
const uid2 = require('uid2');
// Utils
const throwError = require('../utils/throwError');
const assertValidObjectId = require('../utils/assertValidObjectId');
const { findByIdOrThrow } = require('../utils/mongooseOrThrow');
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

    return {
        _id: user._id,
        account: {
            username: user.account.username,
            avatar: user.account.avatar,
        },
        newsletter: user.newsletter,
    };
};

module.exports = { signup, login, getOne };

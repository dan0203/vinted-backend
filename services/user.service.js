// Modules npm
const mongoose = require('mongoose');
const Joi = require('joi');
// Model
const User = require('../models/User');
// Encryption
const SHA256 = require('crypto-js/sha256');
const encBase64 = require('crypto-js/enc-base64');
const uid2 = require('uid2');

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

const signup = async data => {
    // Si les données fournies ne correspondent pas au format attendu
    const { error } = signupSchema.validate(data);
    if (error) {
        const customError = new Error(error.details[0].message);
        customError.status = 400;
        throw customError;
    }

    // Si un compte existe déjà avec cette adresse email
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
        const error = new Error('An account already exists with this email address');
        error.status = 409;
        throw error;
    }

    // Si les informations fournies sont validées,
    //  on crée les éléments manquants (salt, hash, token)
    //  et on enregistre le newUser dans la bdd
    const salt = uid2(16);
    const hash = SHA256(data.password + salt).toString(encBase64);
    const token = uid2(16);

    const newUser = new User({
        email: data.email,
        account: {
            username: data.username,
        },
        newsletter: data.newsletter,
        salt,
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

const login = async data => {
    // Si les données fournies ne correspondent pas au format attendu
    const { err } = loginSchema.validate(data);
    if (err) {
        const error = new Error(err.details[0].message);
        error.status = 400;
        throw error;
    }

    // Récupérer en bdd le user correspondant à l'email
    const user = await User.findOne({ email: data.email });

    // S'il n'existe pas, erreur
    if (!user) {
        const error = new Error('Unauthorized');
        error.status = 403;
        throw error;
    }

    // S'il existe, tester la crypto
    const hashCalculated = SHA256(data.password + user.salt).toString(encBase64);

    // Si c'est KO, erreur
    if (hashCalculated !== user.hash) {
        const error = new Error('Unauthorized');
        error.status = 401;
        throw error;
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

const getOne = async data => {
    // Si l'id n'a pas été fourni ou s'il n'est pas au format mongoose
    if (!data.id || !mongoose.isValidObjectId(data.id)) {
        const error = new Error('Invalid or missing user id');
        error.status = 400;
        throw error;
    }

    const user = await User.findById(data.id);

    // S'il n'existe pas, erreur
    if (!user) {
        const error = new Error('User does not exist');
        error.status = 404;
        throw error;
    }

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

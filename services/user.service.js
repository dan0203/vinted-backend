// Model
const User = require('../models/User');
// Encryption
const SHA256 = require('crypto-js/sha256');
const encBase64 = require('crypto-js/enc-base64');
const uid2 = require('uid2');

const signup = async data => {
    // Si aucun username/email/password n'a été fourni
    if (!data.username || !data.email || !data.password) {
        throw new Error('Email, password and username are mandatory');
    }

    // Si un compte existe déjà avec cette adresse email
    const existingUser = await User.findOne({ email: data.email });
    if (existingUser) {
        throw new Error('An account already exists with this email address');
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
        salt: salt,
        hash: hash,
        token: token,
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
    // Récupérer en bdd le user correspondant à l'email
    const user = await User.findOne({ email: data.email });

    // S'il n'existe pas, erreur
    if (!user) {
        throw new Error('Unauthorized');
    }

    // S'il existe, tester la crypto
    const hashCalculated = SHA256(data.password + user.salt).toString(encBase64);

    // Si c'est KO, erreur
    if (hashCalculated !== user.hash) {
        throw new Error('Unauthorized');
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
    const user = await User.findOne({ _id: data.id });

    // S'il n'existe pas, erreur
    if (!user) {
        throw new Error('User does not exist');
    }

    return { _id: user._id, account: { username: user.account.username, avatar: user.account.avatar }, newsletter: user.newsletter };
};

module.exports = { signup, login, getOne };

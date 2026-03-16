// Service
const userService = require('../services/user.service');

const signup = async (req, res, next) => {
    try {
        const newUser = await userService.signup(req.body);

        return res.status(201).json(newUser);
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const user = await userService.login(req.body);

        return res.status(200).json(user);
    } catch (error) {
        next(error);
    }
};

const getOne = async (req, res, next) => {
    try {
        const data = req.params;

        const user = await userService.getOne(data);

        return res.status(200).json(user);
    } catch (error) {
        next(error);
    }
};

module.exports = { signup, login, getOne };

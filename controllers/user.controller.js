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

// Réservé à update/updatePartial/remove ci-dessous, qui ont besoin de
// plusieurs sources à la fois (body, files, params, user) contrairement à
// signup/login/getOne qui n'en consomment qu'une seule.
const buildData = (req) => ({
    body: req.body,
    files: req.files,
    params: req.params,
    user: req.user,
});

const update = async (req, res, next) => {
    try {
        const updatedUser = await userService.update(buildData(req));

        return res.status(200).json(updatedUser);
    } catch (error) {
        next(error);
    }
};

const updatePartial = async (req, res, next) => {
    try {
        const updatedUser = await userService.updatePartial(buildData(req));

        return res.status(200).json(updatedUser);
    } catch (error) {
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const removedUser = await userService.remove(buildData(req));

        return res.status(200).json(removedUser);
    } catch (error) {
        next(error);
    }
};

module.exports = {
    signup,
    login,
    getOne,
    update,
    updatePartial,
    remove,
};

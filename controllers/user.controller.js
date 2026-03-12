// Service
const userService = require('../services/user.service');

const signup = async (req, res) => {
    try {
        const newUser = await userService.signup(req.body);

        return res.status(201).json(newUser);
    } catch (error) {
        switch (error.message) {
            case 'Email, password and username are mandatory':
                return res.status(400).json({
                    message: 'Email, password and username are mandatory',
                });

            case 'An account already exists with this email address':
                return res
                    .status(409) // 409 = Conflit
                    .json({
                        message: 'An account already exists with this email address',
                    });

            default:
                return res.status(500).json(error.message);
        }
    }
};

const login = async (req, res) => {
    try {
        const user = await userService.login(req.body);

        return res.status(200).json(user);
    } catch (error) {
        switch (error.message) {
            case 'Unauthorized':
                return res.status(401).json({
                    message: 'Unauthorized',
                });

            default:
                return res.status(500).json(error.message);
        }
    }
};

const getOne = async (req, res) => {
    try {
        const data = req.params;

        const user = await userService.getOne(data);

        return res.status(200).json(user);
    } catch (error) {
        return res.status(500).json(error.message);
    }
};

module.exports = { signup, login, getOne };

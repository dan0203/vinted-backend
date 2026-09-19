const userService = require('../services/user.service');

const REFRESH_COOKIE_NAME = 'refreshToken';

// Shared by every route that sets/clears the refresh cookie, so the
// httpOnly/sameSite/secure/path attributes can never drift between them -
// clearCookie() must be called with the same attributes used to set it.
const refreshCookieOptions = () => ({
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/users',
});

// maxAge tracks the stored expiry instead of a full TTL: refresh() can hand
// back a token it chose not to rotate, and re-arming the cookie for another
// full lifetime would let it outlive the server record by up to the rotation
// threshold.
const setRefreshCookie = (res, refreshToken, refreshTokenExpiresAt) => {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
        ...refreshCookieOptions(),
        maxAge: refreshTokenExpiresAt.getTime() - Date.now(),
    });
};

// Strips the server-only refreshToken/refreshTokenExpiresAt fields before a
// signup/login/refresh result reaches the JSON response body.
const toAuthResponse = ({
    refreshToken: _refreshToken,
    refreshTokenExpiresAt: _refreshTokenExpiresAt,
    ...rest
}) => rest;

const signup = async (req, res, next) => {
    try {
        const newUser = await userService.signup(req.body);
        setRefreshCookie(
            res,
            newUser.refreshToken,
            newUser.refreshTokenExpiresAt
        );

        return res.status(201).json(toAuthResponse(newUser));
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const user = await userService.login(req.body);
        setRefreshCookie(res, user.refreshToken, user.refreshTokenExpiresAt);

        return res.status(200).json(toAuthResponse(user));
    } catch (error) {
        next(error);
    }
};

const refresh = async (req, res, next) => {
    try {
        const result = await userService.refresh({ cookies: req.cookies });
        setRefreshCookie(
            res,
            result.refreshToken,
            result.refreshTokenExpiresAt
        );

        return res.status(200).json(toAuthResponse(result));
    } catch (error) {
        next(error);
    }
};

const logout = async (req, res, next) => {
    try {
        const result = await userService.logout({ cookies: req.cookies });
        res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const confirmEmail = async (req, res, next) => {
    try {
        const user = await userService.confirmEmail(req.params);

        return res.status(200).json(user);
    } catch (error) {
        next(error);
    }
};

const resendConfirmation = async (req, res, next) => {
    try {
        const result = await userService.resendConfirmation(req.body);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const requestPasswordReset = async (req, res, next) => {
    try {
        const result = await userService.requestPasswordReset(req.body);

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const confirmPasswordReset = async (req, res, next) => {
    try {
        const result = await userService.confirmPasswordReset(req.body);

        return res.status(200).json(result);
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

// Reserved for update/updatePartial/remove below, which need several
// sources at once (body, files, params, user) unlike signup/login/getOne
// which each consume only one.
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

const addFavorite = async (req, res, next) => {
    try {
        const result = await userService.addFavorite(buildData(req));

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const removeFavorite = async (req, res, next) => {
    try {
        const result = await userService.removeFavorite(buildData(req));

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
};

const getFavorites = async (req, res, next) => {
    try {
        const result = await userService.getFavorites(buildData(req));

        return res.status(200).json(result);
    } catch (error) {
        next(error);
    }
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

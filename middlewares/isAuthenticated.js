const User = require('../models/User');
const { MAX_TOKEN_AGE_MS } = require('../utils/constants');

const isAuthenticated = async (req, res, next) => {
    try {
        if (!req.headers.authorization) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = req.headers.authorization.replace('Bearer ', '');
        // _id is included even though it's not in select(): Mongoose always
        // returns it unless explicitly excluded (-_id).
        const user = await User.findOne({ token }).select(
            'email account tokenIssuedAt active'
        );

        if (!user) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const tokenAge = Date.now() - user.tokenIssuedAt.getTime();
        if (tokenAge > MAX_TOKEN_AGE_MS) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        if (!user.active) {
            return res.status(403).json({
                message: 'Please confirm your email address before logging in',
            });
        }

        // req is shared with the controller, so attaching it here makes it
        // available downstream without a second DB lookup.
        req.user = user;

        next();
    } catch (error) {
        next(error);
    }
};

module.exports = isAuthenticated;

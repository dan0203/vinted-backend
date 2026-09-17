const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isAuthenticated = async (req, res, next) => {
    try {
        if (!req.headers.authorization) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const token = req.headers.authorization.replace('Bearer ', '');

        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET);
        } catch {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // _id is included even though it's not in select(): Mongoose always
        // returns it unless explicitly excluded (-_id).
        const user = await User.findById(payload.sub).select(
            'email account active'
        );

        if (!user) {
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

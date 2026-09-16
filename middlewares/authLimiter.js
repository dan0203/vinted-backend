const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many attempts, please try again later.' },
    // Jest sets NODE_ENV=test; the in-memory store would otherwise throttle
    // the test suite itself since every request comes from the same IP.
    skip: () => process.env.NODE_ENV === 'test',
});

module.exports = authLimiter;

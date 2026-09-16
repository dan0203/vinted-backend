// Strips keys that could be interpreted as Mongo operators ($gt, $where...)
// or dotted paths from an object, recursively and in place.
// Only req.body is touched: req.query is a read-only getter on Express 5,
// so it can't be reassigned or mutated in place the way express-mongo-sanitize
// expects (that library assumes Express 4 semantics and throws under
// Express 5). req.params isn't populated yet at this point in the middleware
// chain (route matching happens later), so sanitizing it here would be a
// no-op; route params are already validated via assertValidObjectId.
function stripDangerousKeys(value) {
    if (Array.isArray(value)) {
        value.forEach(stripDangerousKeys);
        return;
    }

    if (value === null || typeof value !== 'object') {
        return;
    }

    for (const key of Object.keys(value)) {
        if (key.startsWith('$') || key.includes('.')) {
            delete value[key];
            continue;
        }
        stripDangerousKeys(value[key]);
    }
}

const sanitizeMongo = (req, res, next) => {
    stripDangerousKeys(req.body);
    next();
};

module.exports = sanitizeMongo;

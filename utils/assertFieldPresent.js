// Utils
const throwError = require('./throwError');
const capitalize = require('./capitalize');

function assertFieldPresent(data, fieldName) {
    if (!data || !data[fieldName] || String(data[fieldName]).trim() === '') {
        throwError(`${capitalize(fieldName)} is mandatory`, 400);
    }
}

module.exports = assertFieldPresent;

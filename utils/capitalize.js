function capitalize(str) {
    return str.length === 0 ? '' : `${str.at(0).toUpperCase()}${str.slice(1)}`;
}

module.exports = capitalize;

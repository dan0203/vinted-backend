function capitalize(str) {
    return `${str.at(0).toUpperCase()}${str.slice(1)}`;
}

module.exports = capitalize;

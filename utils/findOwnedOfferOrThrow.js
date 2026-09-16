const Offer = require('../models/Offer');
const { OFFER } = require('./constants');
const { findByIdOrThrow } = require('./mongooseOrThrow');
const throwError = require('./throwError');

async function findOwnedOfferOrThrow(objectId, userId) {
    const offer = await findByIdOrThrow(Offer, objectId, OFFER);

    // L'offre n'appartient pas au user connecté
    if (!userId.equals(offer.owner._id)) {
        throwError('Unauthorized', 403);
    }

    return offer;
}

module.exports = findOwnedOfferOrThrow;

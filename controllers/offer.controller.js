// Service
const offerService = require('../services/offer.service');

// Chaque source de données (body, files, query, params, user) garde sa
// propre clé plutôt que d'être aplatie sur `data` : plus prévisible pour le
// service, et pas d'ambiguïté si une route combine un jour plusieurs sources.
const buildData = (req) => ({
    body: req.body,
    files: req.files,
    query: req.query,
    params: req.params,
    user: req.user,
});

const publish = async (req, res, next) => {
    // Les clefs textuelles du formData sont dans req.body
    // Les clefs fichiers du formData sont dans req.files
    try {
        const newOffer = await offerService.publish(buildData(req));

        return res.status(201).json(newOffer);
    } catch (error) {
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const updatedOffer = await offerService.update(buildData(req));

        return res.status(200).json(updatedOffer);
    } catch (error) {
        next(error);
    }
};

const updatePartial = async (req, res, next) => {
    try {
        const updatedOffer = await offerService.updatePartial(buildData(req));

        return res.status(200).json(updatedOffer);
    } catch (error) {
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const removedOffer = await offerService.remove(buildData(req));

        return res.status(200).json(removedOffer);
    } catch (error) {
        next(error);
    }
};

const getAll = async (req, res, next) => {
    try {
        const getAllOffers = await offerService.getAll(buildData(req));

        return res.status(200).json(getAllOffers);
    } catch (error) {
        next(error);
    }
};

const getOne = async (req, res, next) => {
    try {
        const offer = await offerService.getOne(buildData(req));

        return res.status(200).json(offer);
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, publish, update, updatePartial, remove, getOne };

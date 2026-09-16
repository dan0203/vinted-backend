const offerService = require('../services/offer.service');

// Each data source (body, files, query, params, user) keeps its own key
// instead of being flattened onto `data`: more predictable for the service,
// and no ambiguity if a route ever combines several sources.
const buildData = (req) => ({
    body: req.body,
    files: req.files,
    query: req.query,
    params: req.params,
    user: req.user,
});

const publish = async (req, res, next) => {
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

// Service
const offerService = require('../services/offer.service');

const publish = async (req, res, next) => {
    // Les clefs textuelles du formData sont dans req.body
    // Les clefs fichiers du formData sont dans req.files
    try {
        const data = {
            body: req.body,
            files: req.files,
            user: req.user,
        };

        const newOffer = await offerService.publish(data);

        return res.status(201).json(newOffer);
    } catch (error) {
        next(error);
    }
};

const update = async (req, res, next) => {
    try {
        const data = {
            body: req.body,
            files: req.files,
            id: req.params.id,
            user: req.user,
        };

        const updatedOffer = await offerService.update(data);

        return res.status(200).json(updatedOffer);
    } catch (error) {
        next(error);
    }
};

const remove = async (req, res, next) => {
    try {
        const data = {
            id: req.params.id,
            user: req.user,
        };

        const removedOffer = await offerService.remove(data);

        return res.status(200).json(removedOffer);
    } catch (error) {
        next(error);
    }
};

const getAll = async (req, res, next) => {
    try {
        const data = req.query;

        const getAllOffers = await offerService.getAll(data);

        return res.status(200).json(getAllOffers);
    } catch (error) {
        next(error);
    }
};

const getOne = async (req, res, next) => {
    try {
        const data = req.params;

        const offer = await offerService.getOne(data);

        return res.status(200).json(offer);
    } catch (error) {
        next(error);
    }
};

module.exports = { getAll, publish, update, remove, getOne };

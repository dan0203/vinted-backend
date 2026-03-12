// Service
const offerService = require('../services/offer.service');

const publish = async (req, res) => {
    try {
        const data = {
            body: req.body, // Les clefs textuelles du formData sont dans req.body
            files: req.files, // Les clefs fichiers du formData sont dans req.files
            user: req.user,
        };

        const newOffer = await offerService.publish(data);

        return res.status(201).json(newOffer);
    } catch (error) {
        return res.status(500).json(error.message);
    }
};

const update = async (req, res) => {
    try {
        const data = {
            body: req.body, // Les clefs textuelles du formData sont dans req.body
            files: req.files, // Les clefs fichiers du formData sont dans req.files
            id: req.params.id,
            user: req.user,
        };

        const updatedOffer = await offerService.update(data);

        return res.status(201).json(updatedOffer);
    } catch (error) {
        return res.status(500).json(error.message);
    }
};

const remove = async (req, res) => {
    try {
        const data = {
            id: req.params.id,
            user: req.user,
        };

        const removedOffer = await offerService.remove(data);

        return res.status(201).json(removedOffer);
    } catch (error) {
        return res.status(500).json(error.message);
    }
};

const getAll = async (req, res) => {
    try {
        const data = req.query;

        const getAllOffers = await offerService.getAll(data);

        return res.status(200).json(getAllOffers);
    } catch (error) {
        return res.status(500).json(error.message);
    }
};

const getOne = async (req, res) => {
    try {
        const data = req.params;

        const getOne = await offerService.getOne(data);

        return res.status(200).json(getOne);
    } catch (error) {
        return res.status(error.statusCode || 500).json({ message: error.message });
    }
};

module.exports = { getAll, publish, update, remove, getOne };

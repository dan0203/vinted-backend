// Modules npm
const mongoose = require('mongoose');
// Model
const Offer = require('../models/Offer');
// Utils
const throwError = require('../utils/throwError');
const escapeRegex = require('../utils/escapeRegex');
const findByIdOrThrow = require('../utils/findByIdOrThrow');
const { uploadImage, removeImage } = require('../utils/cloudinary');
const assertCorrectData = require('../utils/assertCorrectData');

// Dans ce service, la validation des données se fait manuellement, comparé à user service qui utilise le package Joi

async function findOwnedOfferOrThrow(data) {
    const offer = await findByIdOrThrow(Offer, data.id, 'Offer');

    // L'offre n'appartient pas au user connecté
    if (!data.user._id.equals(offer.owner._id)) {
        throwError('Unauthorized', 403);
    }

    return offer;
}

const baseOfferFields = [
    {
        name: 'title',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'description',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'price',
        type: 'number',
        min: 0,
        exclusiveMin: true,
        required: true,
        source: 'body',
    },
    {
        name: 'condition',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'city',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'brand',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'size',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'color',
        type: 'string',
        required: true,
        source: 'body',
    },
    {
        name: 'picture',
        type: 'file',
        required: true,
        source: 'files',
    },
];

const publish = async (data) => {
    const fields = [...baseOfferFields];
    assertCorrectData(data, fields);

    const price = Number(data.body.price);

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    const cloudinaryResponse = await uploadImage(data.files, newOfferId);

    const newOffer = new Offer({
        _id: newOfferId,
        product_name: data.body.title,
        product_description: data.body.description,
        product_price: price,
        product_details: [
            {
                MARQUE: data.body.brand,
            },
            {
                TAILLE: data.body.size,
            },
            {
                COULEUR: data.body.color,
            },
            {
                ÉTAT: data.body.condition,
            },
            {
                EMPLACEMENT: data.body.city,
            },
        ],
        product_image: cloudinaryResponse,
        product_pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    });

    try {
        await newOffer.save();
    } catch (error) {
        if (cloudinaryResponse.public_id) {
            await removeImage(cloudinaryResponse.public_id, newOfferId);
        }
        throw error;
    }

    await newOffer.populate('owner', '_id account');

    return newOffer;
};

const update = async (data) => {
    const fields = [
        ...baseOfferFields,
        {
            name: 'id',
            type: 'objectId',
            required: true,
            source: 'params',
        },
    ];
    assertCorrectData(data, fields, 'offer');

    const offerToUpdate = await findOwnedOfferOrThrow(data);

    const price = Number(data.body.price);

    const cloudinaryResponse = await uploadImage(data.files, data.id);

    const updateData = {
        product_name: data.body.title,
        product_description: data.body.description,
        product_price: price,
        product_details: [
            {
                MARQUE: data.body.brand,
            },
            {
                TAILLE: data.body.size,
            },
            {
                COULEUR: data.body.color,
            },
            {
                ÉTAT: data.body.condition,
            },
            {
                EMPLACEMENT: data.body.city,
            },
        ],
        product_image: cloudinaryResponse,
        product_pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    };

    let updatedOffer;

    try {
        updatedOffer = await Offer.findByIdAndUpdate(data.id, updateData, {
            returnDocument: 'after',
            runValidators: true,
        });
    } catch (error) {
        if (cloudinaryResponse.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }
        throw error;
    }

    // S'il y a une erreur dans findByIdAndUpdate, il renvoie un élément vide
    // Dans ce cas, supprimer l'image que l'on vient d'uploader et lever une exception
    if (!updatedOffer) {
        if (cloudinaryResponse.public_id) {
            await removeImage(cloudinaryResponse.public_id);
        }

        throwError('Failed to update offer', 500);
    }

    await updatedOffer.populate('owner', '_id account');

    const updatedOfferToReturn = {
        product_name: updatedOffer.product_name,
        product_description: updatedOffer.product_description,
        product_price: updatedOffer.product_price,
        product_details: updatedOffer.product_details,
        product_image: updatedOffer.product_image,
        owner: updatedOffer.owner,
    };

    // Si tout s'est bien passé, on supprime l'ancienne image
    if (offerToUpdate.product_image.public_id) {
        await removeImage(offerToUpdate.product_image.public_id);
    }

    return updatedOfferToReturn;
};

const updatePartial = async (data) => {
    const hasBody = !!data.body;
    const hasFiles = !!data.files;

    if (!hasBody && !hasFiles) {
        throwError('No data was sent', 400);
    }

    const fields = [
        {
            name: 'id',
            type: 'objectId',
            required: true,
            source: 'params',
        },
    ];

    if (hasBody) {
        fields.push(
            {
                name: 'title',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'description',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'price',
                type: 'number',
                min: 0,
                exclusiveMin: true,
                required: false,
                source: 'body',
            },
            {
                name: 'condition',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'city',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'brand',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'size',
                type: 'string',
                required: false,
                source: 'body',
            },
            {
                name: 'color',
                type: 'string',
                required: false,
                source: 'body',
            }
        );
    }

    if (hasFiles) {
        fields.push({
            name: 'picture',
            type: 'file',
            required: false,
            source: 'files',
        });
    }

    assertCorrectData(data, fields, 'offer');

    const offerToUpdate = await findOwnedOfferOrThrow(data);

    const updateFields = {};

    if (hasBody) {
        if (data.body.title !== undefined)
            updateFields.product_name = data.body.title;
        if (data.body.description !== undefined)
            updateFields.product_description = data.body.description;
        if (data.body.price !== undefined)
            updateFields.product_price = Number(data.body.price);

        const product_details = [...offerToUpdate.product_details];

        const fieldToKey = {
            brand: 'MARQUE',
            size: 'TAILLE',
            color: 'COULEUR',
            condition: 'ÉTAT',
            city: 'EMPLACEMENT',
        };

        const upsertDetail = (details, key, value) => {
            const index = details.findIndex((d) => key in d);
            if (index !== -1) {
                details[index] = { [key]: value };
            } else {
                details.push({ [key]: value });
            }
        };

        let hasChangedProductDetails = false;

        Object.keys(fieldToKey).forEach((key) => {
            if (data.body[key] !== undefined && data.body[key].trim() !== '') {
                upsertDetail(product_details, fieldToKey[key], data.body[key]);
                hasChangedProductDetails = true;
            }
        });

        if (hasChangedProductDetails)
            updateFields.product_details = product_details;
    }

    let cloudinaryResponse;
    if (hasFiles) {
        cloudinaryResponse = await uploadImage(data.files, data.id);

        updateFields.product_image = cloudinaryResponse;
    }

    let updatedOffer;
    try {
        updatedOffer = await Offer.findByIdAndUpdate(data.id, updateFields, {
            returnDocument: 'after',
            runValidators: true,
        });

        // S'il y a une erreur dans findByIdAndUpdate, il renvoie un élément vide
        // Dans ce cas, supprimer l'image que l'on vient d'uploader et lever une exception
        if (!updatedOffer) {
            throwError('Failed to update offer', 500);
        }
    } catch (error) {
        await removeImage(cloudinaryResponse.public_id);

        throw error;
    }

    await updatedOffer.populate('owner', '_id account');

    const updatedOfferToReturn = {
        product_name: updatedOffer.product_name,
        product_description: updatedOffer.product_description,
        product_price: updatedOffer.product_price,
        product_details: updatedOffer.product_details,
        product_image: updatedOffer.product_image,
        owner: updatedOffer.owner,
    };

    // Si tout s'est bien passé, on supprime l'ancienne image
    if (
        cloudinaryResponse !== undefined &&
        offerToUpdate.product_image.public_id
    ) {
        await removeImage(offerToUpdate.product_image.public_id);
    }

    return updatedOfferToReturn;
};

const remove = async (data) => {
    const fields = [{ name: 'id', type: 'objectId', source: 'params' }];
    assertCorrectData(data, fields, 'offer');

    await findOwnedOfferOrThrow(data);

    let removedOffer;

    removedOffer = await Offer.findByIdAndDelete(data.id).populate(
        'owner',
        '_id account'
    );

    // S'il y a une erreur dans findByIdAndDelete, il renvoie un élément vide
    // Dans ce cas, lever une exception
    if (!removedOffer) {
        throwError('Offer does not exist', 404);
    }

    // Si tout s'est bien passé, on supprime les images du dossier et le dossier lui-même dans Cloudinary
    if (removedOffer.product_image.public_id) {
        try {
            await removeImage(
                removedOffer.product_image.public_id,
                removedOffer._id
            );
        } catch (error) {
            console.error(
                'Cloudinary cleanup failed:',
                error.error?.message || error.message || error
            );
        }
    }

    return {
        _id: removedOffer._id,
        product_name: removedOffer.product_name,
        product_description: removedOffer.product_description,
        product_price: removedOffer.product_price,
        product_details: removedOffer.product_details,
        product_pictures: removedOffer.product_pictures,
        product_image: removedOffer.product_image,
        product_date: removedOffer.product_date,
        owner: removedOffer.owner,
    };
};

const getAll = async (data) => {
    const fields = [
        {
            name: 'title',
            type: 'string',
            required: false,
            source: 'query',
        },
        {
            name: 'priceMin',
            type: 'number',
            min: 0,
            required: false,
            source: 'query',
        },
        {
            name: 'priceMax',
            type: 'number',
            min: 0,
            required: false,
            source: 'query',
        },
        {
            name: 'page',
            type: 'number',
            min: 0,
            required: false,
            source: 'query',
        },
        {
            name: 'sort',
            type: 'string',
            required: false,
            source: 'query',
            options: ['price-asc', 'price-desc'],
        },
    ];
    assertCorrectData(data, fields, 'offer');

    const filters = {};

    // Filtre title
    if (data.title) {
        filters.product_name = new RegExp(escapeRegex(data.title), 'i');
    }

    // Filtres priceMin et priceMax
    const min = data.priceMin === undefined ? undefined : Number(data.priceMin);
    const max = data.priceMax === undefined ? undefined : Number(data.priceMax);

    if (Number.isFinite(min) || Number.isFinite(max)) {
        filters.product_price = {};
        if (Number.isFinite(min)) filters.product_price.$gte = min;
        if (Number.isFinite(max)) filters.product_price.$lte = max;
    }

    if (min !== undefined && max !== undefined && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    // Filtre page
    const page = data.page === undefined ? 1 : Number(data.page);

    const nbOffersPerPage = 20;
    const nbOffersToSkip = nbOffersPerPage * (page - 1);

    // Filtre sort
    let sort = data.sort === undefined ? 'price-asc' : data.sort;

    sort = sort.replace('price-', '');

    // Récupération des offres correspondant aux filtres et à la page demandés
    const offers = await Offer.find(filters)
        .populate('owner', '_id account')
        .sort({ product_price: sort })
        .limit(nbOffersPerPage)
        .skip(nbOffersToSkip);

    // Nombre de documents correspondant aux filtres
    const count = await Offer.countDocuments(filters);

    return { count, offers };
};

const getOne = async (data) => {
    const fields = [
        { name: 'id', type: 'objectId', required: true, source: 'params' },
    ];
    assertCorrectData(data, fields, 'offer');

    const offer = await findByIdOrThrow(Offer, data.id, 'Offer');
    await offer.populate('owner', '_id account');

    return {
        _id: offer._id,
        product_name: offer.product_name,
        product_description: offer.product_description,
        product_price: offer.product_price,
        product_details: offer.product_details,
        product_pictures: offer.product_pictures,
        product_image: offer.product_image,
        product_date: offer.product_date,
        owner: offer.owner,
    };
};

module.exports = { getAll, publish, update, updatePartial, remove, getOne };

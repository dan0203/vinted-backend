// Modules npm
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
// Model
const Offer = require('../models/Offer');
// Utils
const convertToBase64 = require('../utils/convertToBase64');
const throwError = require('../utils/throwError');
const escapeRegex = require('../utils/escapeRegex');

// Dans ce service, la validation des données se fait manuellement, comparé à user service qui utilise le package Joi

function assertValidOfferId(data) {
    // data.id est une chaîne vide
    if (data.id.trim() === '') {
        throwError('Offer id is mandatory', 400);
    }

    // data.id au mauvais format
    if (!mongoose.Types.ObjectId.isValid(data.id)) {
        throwError('Invalid offer id', 400);
    }
}

async function findOwnedOfferOrThrow(data) {
    assertValidOfferId(data);

    // Vérifier que l'offre existe
    const offerToUpdate = await Offer.findById(data.id);

    // Pas d'offre existante
    if (!offerToUpdate) {
        throwError('Offer does not exist', 404);
    }

    // L'offre n'appartient pas au user connecté
    if (!data.user._id.equals(offerToUpdate.owner._id)) {
        throwError('Unauthorized', 403);
    }

    return offerToUpdate;
}

const publish = async (data) => {
    if (data.body.title === undefined || data.body.title.trim() === '') {
        throwError('Title is mandatory', 400);
    }

    if (
        data.body.description === undefined ||
        data.body.description.trim() === ''
    ) {
        throwError('Description is mandatory', 400);
    }

    if (data.body.price === undefined || data.body.price.trim() === '') {
        throwError('Price is mandatory', 400);
    }

    const price = Number(data.body.price);
    if (!Number.isFinite(price)) {
        throwError('Price must be a number', 400);
    }

    if (price < 0) {
        throwError('Price must be greater than or equal to 0', 400);
    }

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    let cloudinaryResponse = {};
    const folderPath = `vinted/offers/${newOfferId}`;

    if (data.files) {
        if (!data.files.picture) {
            throwError(
                'Picture file must be sent using a param named "picture"',
                400
            );
        }

        // Transforme mon image de Buffer à String
        const base64Image = convertToBase64(data.files.picture);

        // On fait une requête à cloudinary pour qu'il héberge l'image
        cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
            // dans un sous-dossier correspondant à l'id de l'offre
            asset_folder: folderPath,
        });
    }

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
        product_pictures: [], // Si besoin d'uploader plusieurs images
        product_image: cloudinaryResponse,
        owner: data.user._id,
    });

    try {
        await newOffer.save();
    } catch (error) {
        if (cloudinaryResponse.public_id) {
            await cloudinary.uploader.destroy(cloudinaryResponse.public_id);
            await cloudinary.api.delete_folder(folderPath);
        }
        throw error;
    }

    await newOffer.populate('owner', '_id account');

    return newOffer;
};

const update = async (data) => {
    const offerToUpdate = await findOwnedOfferOrThrow(data);

    if (data.body.title === undefined || data.body.title.trim() === '') {
        throwError('Title is mandatory', 400);
    }

    if (
        data.body.description === undefined ||
        data.body.description.trim() === ''
    ) {
        throwError('Description is mandatory', 400);
    }

    if (data.body.price === undefined || data.body.price.trim() === '') {
        throwError('Price is mandatory', 400);
    }

    const price = Number(data.body.price);
    if (!Number.isFinite(price)) {
        throwError('Price must be a number', 400);
    }

    if (price < 0) {
        throwError('Price must be greater than or equal to 0', 400);
    }

    let cloudinaryResponse = null;
    const folderPath = `vinted/offers/${data.id}`;

    if (data.files) {
        if (!data.files.picture) {
            throwError(
                'Picture file must be sent using a param named "picture"',
                400
            );
        }

        // Transforme mon image de Buffer à String
        const base64Image = convertToBase64(data.files.picture);

        // On fait une requête à cloudinary pour qu'il héberge l'image
        cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
            // dans un sous-dossier correspondant à l'id de l'offre
            asset_folder: folderPath,
        });
    }

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
        product_pictures: [], // Si besoin d'uploader plusieurs images
        owner: data.user._id,
    };

    if (cloudinaryResponse) {
        updateData.product_image = cloudinaryResponse;
    }

    let updatedOffer;

    try {
        updatedOffer = await Offer.findByIdAndUpdate(data.id, updateData, {
            returnDocument: 'after',
            runValidators: true,
        });
    } catch (error) {
        if (cloudinaryResponse && cloudinaryResponse.public_id) {
            await cloudinary.uploader.destroy(cloudinaryResponse.public_id);
        }
        throw error;
    }

    // S'il y a une erreur dans findByIdAndUpdate, il renvoie un élément vide
    // Dans ce cas, supprimer l'image que l'on vient d'uploader et lever une exception
    if (!updatedOffer) {
        if (cloudinaryResponse && cloudinaryResponse.public_id) {
            await cloudinary.uploader.destroy(cloudinaryResponse.public_id);
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
    if (cloudinaryResponse && offerToUpdate.product_image.public_id) {
        await cloudinary.uploader.destroy(
            offerToUpdate.product_image.public_id
        );
    }

    return updatedOfferToReturn;
};

const updatePartial = async (data) => {
    const offerToUpdate = await findOwnedOfferOrThrow(data);

    const hasBody =
        data.body !== undefined &&
        ((data.body.title !== undefined && data.body.title.trim() !== '') ||
            (data.body.description !== undefined &&
                data.body.description.trim() !== '') ||
            (data.body.price !== undefined && data.body.price.trim() !== '') ||
            (data.body.brand !== undefined && data.body.brand.trim() !== '') ||
            (data.body.size !== undefined && data.body.size.trim() !== '') ||
            (data.body.color !== undefined && data.body.color.trim() !== '') ||
            (data.body.condition !== undefined &&
                data.body.condition.trim() !== '') ||
            (data.body.city !== undefined && data.body.city.trim() !== ''));

    const hasFiles = !!data.files;

    if (!hasBody && !hasFiles) {
        throwError('No data was sent', 400);
    }

    const updateFields = {};

    if (hasBody) {
        let price;

        if (data.body.price !== undefined && data.body.price.trim() !== '') {
            price = Number(data.body.price);

            if (!Number.isFinite(price)) {
                throwError('Price must be a number', 400);
            }

            if (price < 0) {
                throwError('Price must be greater than or equal to 0', 400);
            }
        }
        if (data.body.title !== undefined && data.body.title.trim() !== '')
            updateFields.product_name = data.body.title;
        if (
            data.body.description !== undefined &&
            data.body.description.trim() !== ''
        )
            updateFields.product_description = data.body.description;
        if (data.body.price !== undefined && data.body.price.trim() !== '')
            updateFields.product_price = data.body.price;

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
        const folderPath = `vinted/offers/${data.id}`;

        if (!data.files.picture) {
            throwError(
                'Picture file must be sent using a param named "picture"',
                400
            );
        }

        // Transforme mon image de Buffer à String
        const base64Image = convertToBase64(data.files.picture);

        // On fait une requête à cloudinary pour qu'il héberge l'image
        cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
            // dans un sous-dossier correspondant à l'id de l'offre
            asset_folder: folderPath,
        });

        if (cloudinaryResponse) {
            updateFields.product_image = cloudinaryResponse;
        }
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
        if (cloudinaryResponse !== undefined && cloudinaryResponse.public_id) {
            await cloudinary.uploader.destroy(cloudinaryResponse.public_id);
        }

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
        await cloudinary.uploader.destroy(
            offerToUpdate.product_image.public_id
        );
    }

    return updatedOfferToReturn;
};

const remove = async (data) => {
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
            await cloudinary.uploader.destroy(
                removedOffer.product_image.public_id
            );
            await cloudinary.api.delete_folder(
                `vinted/offers/${removedOffer._id}`
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
    const filters = {};

    // Filtre title
    if (data.title) {
        filters.product_name = new RegExp(escapeRegex(data.title), 'i');
    }

    // Filtres priceMin et priceMax
    const min = data.priceMin === undefined ? undefined : Number(data.priceMin);
    const max = data.priceMax === undefined ? undefined : Number(data.priceMax);

    // si priceMin ou priceMax ne sont pas des nombres strictement positifs
    if (
        (data.priceMin !== undefined && !Number.isFinite(min)) ||
        (Number.isFinite(min) && min < 0) ||
        (data.priceMax !== undefined && !Number.isFinite(max)) ||
        (Number.isFinite(max) && max < 0)
    ) {
        throwError('Invalid price filter', 400);
    }

    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        throwError('priceMin cannot be greater than priceMax', 400);
    }

    if (Number.isFinite(min) || Number.isFinite(max)) {
        filters.product_price = {};
        if (Number.isFinite(min)) filters.product_price.$gte = min;
        if (Number.isFinite(max)) filters.product_price.$lte = max;
    }

    // Filtre page
    const page = data.page === undefined ? 1 : Number(data.page);

    if (!Number.isFinite(page) || page <= 0) {
        throwError('Invalid page filter', 400);
    }

    const nbOffersPerPage = 20;
    const nbOffersToSkip = nbOffersPerPage * (page - 1);

    // Filtre sort
    let sort = data.sort === undefined ? 'price-asc' : data.sort;

    if (sort !== 'price-asc' && sort !== 'price-desc') {
        throwError('Invalid sort filter', 400);
    }

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
    assertValidOfferId(data);

    const offer = await Offer.findById(data.id).populate(
        'owner',
        '_id account'
    );

    // data.id valide au format MongoDB mais offre inexistante
    if (!offer) {
        throwError('Offer does not exist', 404);
    }

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

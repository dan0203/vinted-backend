// Modules npm
const cloudinary = require('cloudinary').v2;
const mongoose = require('mongoose');
// Model
const Offer = require('../models/Offer');
// Utils
const convertToBase64 = require('../utils/convertToBase64');

const publish = async data => {
    if (data.body.title === undefined || data.body.title.trim() === '') {
        const error = new Error('Title is mandatory');
        error.status = 400;
        throw error;
    }

    if (data.body.description === undefined || data.body.description.trim() === '') {
        const error = new Error('Description is mandatory');
        error.status = 400;
        throw error;
    }

    if (data.body.price === undefined || data.body.price.trim() === '') {
        const error = new Error('Price is mandatory');
        error.status = 400;
        throw error;
    }

    const price = Number(data.body.price);
    if (!Number.isFinite(price)) {
        const error = new Error('Price must be a number');
        error.status = 400;
        throw error;
    }

    if (price < 0) {
        const error = new Error('Price must be greater than or equal to 0');
        error.status = 400;
        throw error;
    }

    // On génère un id MongoDB pour le chemin de stockage de l'image dans cloudinary
    const newOfferId = new mongoose.Types.ObjectId();

    let cloudinaryResponse = {};
    const folderPath = `vinted/offers/${newOfferId}`;

    if (data.files) {
        if (!data.files.picture) {
            const error = new Error('Picture file must be sent using a param named "picture"');
            error.status = 400;
            throw error;
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

    await newOffer.populate('owner', '_id token account');

    return newOffer;
};

const update = async data => {
    // Vérifier que le user est bien le owner de cette offre
    const offerToUpdate = await Offer.findById(data.id);

    if (!data.user._id.equals(offerToUpdate.owner._id)) {
        throw new Error('Unauthorized');
    }

    // Transforme mon image de Buffer à String
    const base64Image = convertToBase64(data.files.picture);

    // Je fais une requête à cloudinary pour qu'il héberge mon image
    const cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
        asset_folder: `/vinted/offers/`, // asset_folder: `/vinted/offers/${data.id}`,
    });

    const updatedOffer = await Offer.findByIdAndUpdate(
        data.id,
        {
            product_name: data.body.title,
            product_description: data.body.description,
            product_price: data.body.price,
            product_details: [
                {
                    MARQUE: data.body.brand,
                },
                {
                    TAILLE: data.body.size,
                },
                {
                    ÉTAT: data.body.condition,
                },
                {
                    COULEUR: data.body.color,
                },
                {
                    EMPLACEMENT: data.body.city,
                },
            ],
            product_image: {
                public_id: cloudinaryResponse.public_id,
                secure_url: cloudinaryResponse.secure_url,
            },
            owner: data.user._id,
        },
        { new: true },
    );

    const updatedOfferToReturn = {
        product_name: updatedOffer.product_name,
        product_description: updatedOffer.product_description,
        product_price: updatedOffer.product_price,
        product_details: updatedOffer.product_details,
        product_image: updatedOffer.product_image,
        owner: {
            account: data.user.account,
            _id: data.user._id,
        },
    };

    // Si tout s'est bien passé, on supprime l'ancienne image
    await cloudinary.uploader.destroy(offerToUpdate.product_image.public_id);

    return updatedOfferToReturn;
};

const remove = async data => {
    // Vérifier que le user est bien le owner de cette offre
    const offerToRemove = await Offer.findById(data.id);

    if (!offerToRemove) {
        throw new Error('Offer does not exist');
    }

    // 8 : accès non autorisé => middleware + test ci-dessous
    if (!data.user._id.equals(offerToRemove.owner._id)) {
        throw new Error('Unauthorized');
    }

    // 9 : route protégée => middleware dans la route

    // Supprimer de la bdd
    await Offer.findByIdAndDelete(data.id);

    // NOTE: suppression images + dossier à terminer
    // Supprimer dans cloudinary : le dossier complet (ici, uniquement l'ancienne image)
    // await cloudinary.uploader.destroy(offerToRemove.product_image.public_id);
    // await cloudinary.api.delete_resources_by_prefix(
    //     `/vinted/${offerToRemove._id}/`,
    //     function (result) {
    //         console.log(result);
    //     },
    // );

    // 1. Supprimer tous les assets du dossier
    // console.log(`vinted/offers/${offerToRemove._id}/`);

    // await cloudinary.api.delete_resources_by_prefix(
    //     `vinted/offers/${offerToRemove._id}/`,
    // );

    // // 2. Supprimer le dossier vide
    // await cloudinary.api.delete_folder(`/vinted/offers/${offerToRemove._id}`);

    return 'Deleted';
};

const getAll = async data => {
    const filters = {};

    // Filtre title
    if (data.title) {
        filters.product_name = new RegExp(data.title, 'i');
    }

    // Filtres priceMin et priceMax
    const min = data.priceMin === undefined ? undefined : Number(data.priceMin);
    const max = data.priceMax === undefined ? undefined : Number(data.priceMax);

    // si priceMin ou priceMax ne sont pas des nombres strictement positifs
    if ((data.priceMin !== undefined && !Number.isFinite(min)) || (Number.isFinite(min) && min < 0) || (data.priceMax !== undefined && !Number.isFinite(max)) || (Number.isFinite(max) && max < 0)) {
        const error = new Error('Invalid price filter');
        error.status = 400;
        throw error;
    }

    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        const error = new Error('priceMin cannot be greater than priceMax');
        error.status = 400;
        throw error;
    }

    if (Number.isFinite(min) || Number.isFinite(max)) {
        filters.product_price = {};
        if (Number.isFinite(min)) filters.product_price.$gte = min;
        if (Number.isFinite(max)) filters.product_price.$lte = max;
    }

    // Filtre page
    const page = data.page === undefined ? 1 : Number(data.page);

    if (!Number.isFinite(page) || page <= 0) {
        const error = new Error('Invalid page filter');
        error.status = 400;
        throw error;
    }

    const nbOffersPerPage = 20;
    const nbOffersToSkip = nbOffersPerPage * (page - 1);

    // Filtre sort
    let sort = data.sort === undefined ? 'price-asc' : data.sort;

    if (sort !== 'price-asc' && sort !== 'price-desc') {
        const error = new Error('Invalid sort filter');
        error.status = 400;
        throw error;
    }

    sort = sort.replace('price-', '');

    // Récupération des offres correspondant aux filtres et à la page demandés
    const offers = await Offer.find(filters).populate('owner', '_id token account').sort({ product_price: sort }).limit(nbOffersPerPage).skip(nbOffersToSkip);

    // Nombre de documents correspondant aux filtres
    const count = await Offer.countDocuments(filters);

    return { count, offers };
};

const getOne = async data => {
    // data ou data.id falsy (absent, null, chaîne vide...)
    if (!data || !data.id || String(data.id).trim() === '') {
        const error = new Error('Offer id is mandatory');
        error.status = 400;
        throw error;
    }

    // data.id au mauvais format
    if (!mongoose.Types.ObjectId.isValid(data.id)) {
        const error = new Error('Invalid offer id');
        error.status = 400;
        throw error;
    }

    const offer = await Offer.findById(data.id).populate('owner', '_id token account');

    // data.id valide au format MongoDB mais offre inexistante
    if (!offer) {
        const error = new Error('Offer does not exist');
        error.status = 404;
        throw error;
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

module.exports = { getAll, publish, update, remove, getOne };

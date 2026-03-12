const Offer = require('../models/Offer');
const convertToBase64 = require('../utils/convertToBase64');
const cloudinary = require('cloudinary').v2;

const publish = async data => {
    // Transforme mon image de Buffer à String
    const base64Image = convertToBase64(data.files.picture);

    // Je fais une requête à cloudinary pour qu'il héberge mon image
    // const cloudinaryResponse = await cloudinary.uploader.upload(base64Image);
    const cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
        asset_folder: `/vinted/offers/`, // asset_folder: `/vinted/offers/${newOffer._id}`,
    });

    const newOffer = new Offer({
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
        product_image: cloudinaryResponse,
        owner: data.user._id,
    });

    await newOffer.save();

    await newOffer.populate('owner', 'account email');

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

    if (!data.user._id.equals(offerToRemove.owner._id)) {
        throw new Error('Unauthorized');
    }

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
    const min = data.priceMin !== undefined ? Number(data.priceMin) : undefined;
    const max = data.priceMax !== undefined ? Number(data.priceMax) : undefined;

    if ((data.priceMin !== undefined && !Number.isFinite(min)) || (data.priceMax !== undefined && !Number.isFinite(max))) {
        throw new Error('Invalid price filter');
    }

    if (Number.isFinite(min) && Number.isFinite(max) && min > max) {
        throw new Error('priceMin must be less than or equal to priceMax');
    }

    if (Number.isFinite(min) || Number.isFinite(max)) {
        filters.product_price = {};
        if (Number.isFinite(min)) filters.product_price.$gte = min;
        if (Number.isFinite(max)) filters.product_price.$lte = max;
    }

    // Filtre page
    const page = data.page ? data.page : 1;
    const nbOffersPerPage = 20;
    const nbOffersToSkip = nbOffersPerPage * (page - 1);

    // Filtre sort
    const sort = data.sort ? data.sort.replace('price-', '') : 'asc';

    // Récupération des offres correspondant aux filtres et à la page demandés
    const offers = await Offer.find(filters).sort({ product_price: sort }).limit(nbOffersPerPage).skip(nbOffersToSkip);

    // Nombre de documents correspondant aux filtres
    const count = await Offer.countDocuments(filters);

    return { count, offers };
};

const getOne = async data => {
    const offer = await Offer.findById(data.id);

    return offer ? offer : {};
};

module.exports = { getAll, publish, update, remove, getOne };

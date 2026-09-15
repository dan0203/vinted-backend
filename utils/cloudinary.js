// Modules npm
const cloudinary = require('cloudinary').v2;
// Utils
const convertToBase64 = require('./convertToBase64');
const throwError = require('./throwError');

async function uploadImage(files, id) {
    if (!files || !id) {
        throwError(`Upload Cloudinary failed: incorrect data`, 400);
    }

    let cloudinaryResponse;
    const folderPath = `vinted/offers/${id}`;

    if (!files || !files.picture) {
        throwError(
            'Picture file must be sent using a param named "picture"',
            400
        );
    }

    // Transforme mon image de Buffer à String
    const base64Image = convertToBase64(files.picture);

    try {
        // On fait une requête à cloudinary pour qu'il héberge l'image
        cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
            // dans un sous-dossier correspondant à l'id de l'offre
            asset_folder: folderPath,
            // width: 'abc', // générer une erreur pour tester
        });
    } catch (error) {
        throwError(`Upload Cloudinary failed: ${error.message}`, 500);
    }

    return cloudinaryResponse;
}

async function removeImage(imageId, folderName = undefined) {
    if (!imageId) {
        throwError(`Remove Cloudinary failed: incorrect data`, 400);
    }

    try {
        await cloudinary.uploader.destroy(imageId);

        if (folderName !== undefined) {
            const folderPath = `vinted/offers/${folderName}`;
            await cloudinary.api.delete_folder(folderPath);
        }
    } catch (error) {
        throwError(`Remove Cloudinary failed: ${error.message}`, 500);
    }
}

module.exports = { uploadImage, removeImage };

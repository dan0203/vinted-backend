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

// Upload les images secondaires (champ "pictures", 0 à plusieurs fichiers).
// Si l'un des uploads du lot échoue, ceux déjà réussis dans ce même lot sont
// détruits avant de relancer l'erreur, pour ne rien laisser d'orphelin.
async function uploadImages(files, id) {
    if (!files || !files.pictures) {
        return [];
    }

    const folderPath = `vinted/offers/${id}`;
    const pictureFiles = Array.isArray(files.pictures)
        ? files.pictures
        : [files.pictures];

    const results = await Promise.allSettled(
        pictureFiles.map((file) =>
            cloudinary.uploader.upload(convertToBase64(file), {
                asset_folder: folderPath,
            })
        )
    );

    const uploaded = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value);

    const failed = results.find((result) => result.status === 'rejected');
    if (failed) {
        await Promise.allSettled(
            uploaded.map((image) =>
                cloudinary.uploader.destroy(image.public_id)
            )
        );
        throwError(`Upload Cloudinary failed: ${failed.reason.message}`, 500);
    }

    return uploaded;
}

// Upload l'avatar (champ "avatar", optionnel contrairement à "picture" pour
// les offres) : renvoie undefined si aucun fichier n'a été envoyé.
async function uploadAvatar(files, id) {
    if (!files || !files.avatar) {
        return undefined;
    }

    const base64Image = convertToBase64(files.avatar);

    try {
        return await cloudinary.uploader.upload(base64Image, {
            asset_folder: `vinted/users/${id}`,
        });
    } catch (error) {
        throwError(`Upload Cloudinary failed: ${error.message}`, 500);
    }
}

async function removeImage(publicId) {
    if (!publicId) {
        throwError(`Remove Cloudinary failed: incorrect data`, 400);
    }

    try {
        await cloudinary.uploader.destroy(publicId);
    } catch (error) {
        throwError(`Remove Cloudinary failed: ${error.message}`, 500);
    }
}

// Cloudinary exige un dossier vide avant de le supprimer : tous les assets
// qu'il contient doivent déjà avoir été détruits via removeImage() avant
// d'appeler celle-ci.
async function deleteFolder(folderPath) {
    try {
        await cloudinary.api.delete_folder(folderPath);
    } catch (error) {
        throwError(`Remove Cloudinary failed: ${error.message}`, 500);
    }
}

module.exports = {
    uploadImage,
    uploadImages,
    uploadAvatar,
    removeImage,
    deleteFolder,
};

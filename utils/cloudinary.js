const cloudinary = require('cloudinary').v2;
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

    const base64Image = convertToBase64(files.picture);

    try {
        cloudinaryResponse = await cloudinary.uploader.upload(base64Image, {
            asset_folder: folderPath,
        });
    } catch (error) {
        throwError(`Upload Cloudinary failed: ${error.message}`, 500);
    }

    return cloudinaryResponse;
}

// Upload the secondary images ("pictures" field, 0 to several files).
// If one of the uploads in the batch fails, the ones already succeeded in
// that same batch are destroyed before re-throwing the error, so nothing is left orphaned.
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

// Upload the avatar ("avatar" field, optional unlike "picture" for offers):
// returns undefined if no file was sent.
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

// Cloudinary requires a folder to be empty before deleting it: all assets it
// contains must already have been destroyed via removeImage() before
// calling this one.
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

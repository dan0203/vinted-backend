const cloudinary = require('cloudinary').v2;
const convertToBase64 = require('./convertToBase64');
const throwError = require('./throwError');

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

function assertAllowedImageType(file) {
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        throwError('Only JPEG, PNG or WebP images are allowed', 400);
    }
}

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

    assertAllowedImageType(files.picture);
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

    pictureFiles.forEach(assertAllowedImageType);

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

    assertAllowedImageType(files.avatar);
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

// The Admin/Search APIs report errors as { error: { message, http_code } }
// rather than on the error object itself.
function cloudinaryErrorMessage(error) {
    return error.error?.message || error.message;
}

function cloudinaryErrorStatus(error) {
    return error.error?.http_code || error.http_code;
}

// Cloudinary requires a folder to be empty before deleting it: all assets it
// contains must already have been destroyed via removeImage() before
// calling this one.
async function deleteFolder(folderPath) {
    try {
        await cloudinary.api.delete_folder(folderPath);
    } catch (error) {
        throwError(
            `Remove Cloudinary failed: ${cloudinaryErrorMessage(error)}`,
            500
        );
    }
}

const SEARCH_PAGE_SIZE = 500;
// Cloudinary's delete_resources endpoint accepts at most 100 public IDs per call.
const DELETE_BATCH_SIZE = 100;

// Deletes every asset under `folderPath` (including nested per-resource
// subfolders, e.g. vinted/offers/<offerId>) and the now-empty folders
// themselves. Used by the seed script to reset Cloudinary before re-seeding.
//
// Assets are uploaded here via the `asset_folder` option (Cloudinary's
// dynamic folder mode), which assigns them a random public_id unrelated to
// the folder path. delete_resources_by_prefix (public_id-based) therefore
// cannot find them: the Search API, which indexes the `folder` attribute
// directly, is used instead.
async function emptyFolder(folderPath) {
    try {
        let nextCursor;
        do {
            const search = cloudinary.search
                .expression(`folder:${folderPath} OR folder:${folderPath}/*`)
                .max_results(SEARCH_PAGE_SIZE);
            if (nextCursor) search.next_cursor(nextCursor);

            const result = await search.execute();
            const publicIds = result.resources.map(
                (resource) => resource.public_id
            );

            for (let i = 0; i < publicIds.length; i += DELETE_BATCH_SIZE) {
                await cloudinary.api.delete_resources(
                    publicIds.slice(i, i + DELETE_BATCH_SIZE)
                );
            }

            nextCursor = result.next_cursor;
        } while (nextCursor);
    } catch (error) {
        throwError(
            `Cloudinary folder cleanup failed: ${cloudinaryErrorMessage(error)}`,
            500
        );
    }

    let subFolders;
    try {
        ({ folders: subFolders } =
            await cloudinary.api.sub_folders(folderPath));
    } catch (error) {
        if (cloudinaryErrorStatus(error) === 404) return;
        throwError(
            `Cloudinary folder cleanup failed: ${cloudinaryErrorMessage(error)}`,
            500
        );
    }

    for (const folder of subFolders) {
        await deleteFolder(folder.path);
    }

    await deleteFolder(folderPath);
}

module.exports = {
    uploadImage,
    uploadImages,
    uploadAvatar,
    removeImage,
    deleteFolder,
    emptyFolder,
};

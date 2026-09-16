const { removeImage, deleteFolder } = require('./cloudinary');

// Non-blocking log: a successful DB operation should never be failed
// because a Cloudinary cleanup fails afterward.
async function safeRemoveImage(publicId, logLabel) {
    if (!publicId) return;

    try {
        await removeImage(publicId);
    } catch (error) {
        console.error(logLabel, error.error?.message || error.message || error);
    }
}

async function safeDeleteFolder(folderPath, logLabel) {
    try {
        await deleteFolder(folderPath);
    } catch (error) {
        console.error(logLabel, error.error?.message || error.message || error);
    }
}

// If `operation` fails, delete the images that were just uploaded
// (`uploadedImages`, Cloudinary responses with a `public_id`) so none are
// left orphaned.
async function withImageRollback(uploadedImages, operation) {
    try {
        return await operation();
    } catch (error) {
        await Promise.allSettled(
            uploadedImages.map((image) => removeImage(image?.public_id))
        );
        throw error;
    }
}

module.exports = { safeRemoveImage, safeDeleteFolder, withImageRollback };

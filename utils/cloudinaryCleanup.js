const { removeImage, deleteFolder } = require('./cloudinary');

// Log non bloquant : on ne fait jamais échouer une opération réussie en DB
// à cause d'un nettoyage Cloudinary qui échoue derrière.
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

// Si `operation` échoue, on supprime les images qu'on venait d'uploader
// (`uploadedImages`, réponses Cloudinary avec un `public_id`) pour ne pas
// en laisser d'orphelines.
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

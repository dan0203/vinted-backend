const mockRemoveImage = jest.fn();
const mockDeleteFolder = jest.fn();

jest.mock('../utils/cloudinary', () => ({
    removeImage: (...args) => mockRemoveImage(...args),
    deleteFolder: (...args) => mockDeleteFolder(...args),
}));

const {
    safeRemoveImage,
    safeDeleteFolder,
    withImageRollback,
} = require('../utils/cloudinaryCleanup');

afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
});

describe('safeRemoveImage', () => {
    it('does nothing when no publicId is given', async () => {
        await safeRemoveImage(undefined, 'label');

        expect(mockRemoveImage).not.toHaveBeenCalled();
    });

    it('removes the image by public id', async () => {
        mockRemoveImage.mockResolvedValueOnce(undefined);

        await safeRemoveImage('public-id-1', 'label');

        expect(mockRemoveImage).toHaveBeenCalledWith('public-id-1');
    });

    it('logs and swallows a removal failure instead of throwing', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        mockRemoveImage.mockRejectedValueOnce(new Error('destroy failed'));

        await expect(
            safeRemoveImage('public-id-1', 'Failed removing image')
        ).resolves.toBeUndefined();

        expect(consoleSpy).toHaveBeenCalledWith(
            'Failed removing image',
            'destroy failed'
        );
    });
});

describe('safeDeleteFolder', () => {
    it('deletes the folder', async () => {
        mockDeleteFolder.mockResolvedValueOnce(undefined);

        await safeDeleteFolder('vinted/offers/offer1', 'label');

        expect(mockDeleteFolder).toHaveBeenCalledWith('vinted/offers/offer1');
    });

    it('logs and swallows a deletion failure instead of throwing', async () => {
        const consoleSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        mockDeleteFolder.mockRejectedValueOnce(new Error('folder not empty'));

        await expect(
            safeDeleteFolder('vinted/offers/offer1', 'Failed removing folder')
        ).resolves.toBeUndefined();

        expect(consoleSpy).toHaveBeenCalledWith(
            'Failed removing folder',
            'folder not empty'
        );
    });
});

describe('withImageRollback', () => {
    it('returns the operation result when it succeeds', async () => {
        const result = await withImageRollback([], () => Promise.resolve('ok'));

        expect(result).toBe('ok');
        expect(mockRemoveImage).not.toHaveBeenCalled();
    });

    it('rolls back the given images and rethrows when the operation fails', async () => {
        const operationError = new Error('write failed');

        await expect(
            withImageRollback([{ public_id: 'a' }, { public_id: 'b' }], () =>
                Promise.reject(operationError)
            )
        ).rejects.toBe(operationError);

        expect(mockRemoveImage).toHaveBeenCalledWith('a');
        expect(mockRemoveImage).toHaveBeenCalledWith('b');
    });
});

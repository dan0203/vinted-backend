const mockUpload = jest.fn();
const mockDestroy = jest.fn();
const mockDeleteFolder = jest.fn();
const mockSubFolders = jest.fn();
const mockDeleteResources = jest.fn();
const mockSearchExecute = jest.fn();
const mockNextCursor = jest.fn();
const mockMaxResults = jest.fn();
const mockExpression = jest.fn();

jest.mock('cloudinary', () => ({
    v2: {
        uploader: {
            upload: (...args) => mockUpload(...args),
            destroy: (...args) => mockDestroy(...args),
        },
        api: {
            delete_folder: (...args) => mockDeleteFolder(...args),
            sub_folders: (...args) => mockSubFolders(...args),
            delete_resources: (...args) => mockDeleteResources(...args),
        },
        search: {
            expression: (...args) => {
                mockExpression(...args);
                return {
                    max_results: (...maxArgs) => {
                        mockMaxResults(...maxArgs);
                        return {
                            next_cursor: (...cursorArgs) => {
                                mockNextCursor(...cursorArgs);
                                return { execute: () => mockSearchExecute() };
                            },
                            execute: () => mockSearchExecute(),
                        };
                    },
                };
            },
        },
    },
}));

const {
    uploadImage,
    uploadImages,
    uploadAvatar,
    removeImage,
    deleteFolder,
    emptyFolder,
} = require('../utils/cloudinary');

function makeFile(mimetype = 'image/jpeg', name = 'file.jpg') {
    return { mimetype, name, data: Buffer.from('fake-image-bytes') };
}

afterEach(() => {
    jest.clearAllMocks();
});

describe('utils/cloudinary uploadImage', () => {
    it('rejects when files or id are missing', async () => {
        await expect(uploadImage(null, 'offer1')).rejects.toMatchObject({
            status: 400,
        });
        await expect(
            uploadImage({ picture: makeFile() }, undefined)
        ).rejects.toMatchObject({ status: 400 });
    });

    it('rejects when no "picture" field is present', async () => {
        await expect(uploadImage({}, 'offer1')).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining('picture'),
        });
    });

    it('rejects a disallowed image MIME type', async () => {
        await expect(
            uploadImage({ picture: makeFile('image/gif') }, 'offer1')
        ).rejects.toMatchObject({
            status: 400,
            message: 'Only JPEG, PNG or WebP images are allowed',
        });
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it('uploads the picture to the offer-scoped folder', async () => {
        mockUpload.mockResolvedValueOnce({ secure_url: 'https://cdn/x.jpg' });

        const result = await uploadImage({ picture: makeFile() }, 'offer1');

        expect(result).toEqual({ secure_url: 'https://cdn/x.jpg' });
        expect(mockUpload).toHaveBeenCalledWith(
            expect.stringContaining('data:image/jpeg;base64,'),
            { asset_folder: 'vinted/offers/offer1' }
        );
    });

    it('wraps a Cloudinary upload failure as a 500', async () => {
        mockUpload.mockRejectedValueOnce(new Error('network down'));

        await expect(
            uploadImage({ picture: makeFile() }, 'offer1')
        ).rejects.toMatchObject({
            status: 500,
            message: expect.stringContaining('network down'),
        });
    });
});

describe('utils/cloudinary uploadImages', () => {
    it('returns an empty array when no "pictures" field is present', async () => {
        await expect(uploadImages({}, 'offer1')).resolves.toEqual([]);
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it('normalizes a single picture into an array and uploads it', async () => {
        mockUpload.mockResolvedValueOnce({ secure_url: 'https://cdn/a.jpg' });

        const result = await uploadImages({ pictures: makeFile() }, 'offer1');

        expect(result).toEqual([{ secure_url: 'https://cdn/a.jpg' }]);
        expect(mockUpload).toHaveBeenCalledTimes(1);
    });

    it('rejects if any file in the batch has a disallowed MIME type', async () => {
        await expect(
            uploadImages(
                { pictures: [makeFile(), makeFile('application/pdf')] },
                'offer1'
            )
        ).rejects.toMatchObject({ status: 400 });
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it('rolls back already-uploaded images when one upload in the batch fails', async () => {
        mockUpload
            .mockResolvedValueOnce({ public_id: 'ok-1' })
            .mockRejectedValueOnce(new Error('upload 2 failed'));

        await expect(
            uploadImages({ pictures: [makeFile(), makeFile()] }, 'offer1')
        ).rejects.toMatchObject({
            status: 500,
            message: expect.stringContaining('upload 2 failed'),
        });

        expect(mockDestroy).toHaveBeenCalledWith('ok-1');
        expect(mockDestroy).toHaveBeenCalledTimes(1);
    });
});

describe('utils/cloudinary uploadAvatar', () => {
    it('returns undefined when no avatar file is sent', async () => {
        await expect(uploadAvatar({}, 'user1')).resolves.toBeUndefined();
        expect(mockUpload).not.toHaveBeenCalled();
    });

    it('rejects a disallowed avatar MIME type', async () => {
        await expect(
            uploadAvatar({ avatar: makeFile('image/gif') }, 'user1')
        ).rejects.toMatchObject({ status: 400 });
    });

    it('uploads the avatar to the user-scoped folder', async () => {
        mockUpload.mockResolvedValueOnce({ secure_url: 'https://cdn/av.jpg' });

        const result = await uploadAvatar({ avatar: makeFile() }, 'user1');

        expect(result).toEqual({ secure_url: 'https://cdn/av.jpg' });
        expect(mockUpload).toHaveBeenCalledWith(expect.any(String), {
            asset_folder: 'vinted/users/user1',
        });
    });

    it('wraps a Cloudinary avatar upload failure as a 500', async () => {
        mockUpload.mockRejectedValueOnce(new Error('network down'));

        await expect(
            uploadAvatar({ avatar: makeFile() }, 'user1')
        ).rejects.toMatchObject({ status: 500 });
    });
});

describe('utils/cloudinary removeImage', () => {
    it('rejects when no publicId is given', async () => {
        await expect(removeImage()).rejects.toMatchObject({ status: 400 });
        expect(mockDestroy).not.toHaveBeenCalled();
    });

    it('destroys the asset by public id', async () => {
        mockDestroy.mockResolvedValueOnce({ result: 'ok' });

        await removeImage('public-id-1');

        expect(mockDestroy).toHaveBeenCalledWith('public-id-1');
    });

    it('wraps a Cloudinary destroy failure as a 500', async () => {
        mockDestroy.mockRejectedValueOnce(new Error('destroy failed'));

        await expect(removeImage('public-id-1')).rejects.toMatchObject({
            status: 500,
        });
    });
});

describe('utils/cloudinary deleteFolder', () => {
    it('deletes the given folder', async () => {
        mockDeleteFolder.mockResolvedValueOnce({});

        await deleteFolder('vinted/offers/offer1');

        expect(mockDeleteFolder).toHaveBeenCalledWith('vinted/offers/offer1');
    });

    it('wraps a Cloudinary admin-API error using the nested error.message field', async () => {
        mockDeleteFolder.mockRejectedValueOnce({
            error: { message: 'folder not empty', http_code: 400 },
        });

        await expect(
            deleteFolder('vinted/offers/offer1')
        ).rejects.toMatchObject({
            status: 500,
            message: expect.stringContaining('folder not empty'),
        });
    });
});

describe('utils/cloudinary emptyFolder', () => {
    it('deletes every asset found across paginated search pages, then the folder itself', async () => {
        mockSearchExecute
            .mockResolvedValueOnce({
                resources: [{ public_id: 'a' }, { public_id: 'b' }],
                next_cursor: 'page2',
            })
            .mockResolvedValueOnce({
                resources: [{ public_id: 'c' }],
                next_cursor: undefined,
            });
        mockDeleteResources.mockResolvedValue({});
        mockSubFolders.mockResolvedValueOnce({ folders: [] });
        mockDeleteFolder.mockResolvedValueOnce({});

        await emptyFolder('vinted/offers/offer1');

        expect(mockExpression).toHaveBeenCalledWith(
            'folder:vinted/offers/offer1 OR folder:vinted/offers/offer1/*'
        );
        expect(mockDeleteResources).toHaveBeenCalledWith(['a', 'b']);
        expect(mockDeleteResources).toHaveBeenCalledWith(['c']);
        expect(mockDeleteFolder).toHaveBeenCalledWith('vinted/offers/offer1');
    });

    it('recurses into sub-folders before deleting the parent folder', async () => {
        mockSearchExecute.mockResolvedValueOnce({
            resources: [],
            next_cursor: undefined,
        });
        mockSubFolders.mockResolvedValueOnce({
            folders: [{ path: 'vinted/offers/offer1/nested' }],
        });
        mockDeleteFolder.mockResolvedValue({});

        await emptyFolder('vinted/offers/offer1');

        expect(mockDeleteFolder).toHaveBeenCalledWith(
            'vinted/offers/offer1/nested'
        );
        expect(mockDeleteFolder).toHaveBeenCalledWith('vinted/offers/offer1');
    });

    it('treats a 404 on sub_folders as "nothing left to clean" instead of throwing', async () => {
        mockSearchExecute.mockResolvedValueOnce({
            resources: [],
            next_cursor: undefined,
        });
        mockSubFolders.mockRejectedValueOnce({
            error: { message: 'not found', http_code: 404 },
        });

        await expect(
            emptyFolder('vinted/offers/offer1')
        ).resolves.toBeUndefined();
        expect(mockDeleteFolder).not.toHaveBeenCalled();
    });

    it('wraps a non-404 sub_folders error as a 500', async () => {
        mockSearchExecute.mockResolvedValueOnce({
            resources: [],
            next_cursor: undefined,
        });
        mockSubFolders.mockRejectedValueOnce({
            error: { message: 'server error', http_code: 500 },
        });

        await expect(emptyFolder('vinted/offers/offer1')).rejects.toMatchObject(
            { status: 500 }
        );
    });

    it('wraps a search failure as a 500', async () => {
        mockSearchExecute.mockRejectedValueOnce(new Error('search down'));

        await expect(emptyFolder('vinted/offers/offer1')).rejects.toMatchObject(
            { status: 500, message: expect.stringContaining('search down') }
        );
    });
});

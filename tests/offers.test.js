const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');
const cloudinary = require('../utils/cloudinary');
const mongooseOrThrow = require('../utils/mongooseOrThrow');

// The picture is required on publish/update: Cloudinary is mocked so tests
// don't depend on the network or real credentials.
jest.mock('../utils/cloudinary', () => ({
    uploadImage: jest.fn().mockResolvedValue({
        public_id: 'vinted/offers/fake',
        secure_url: 'https://res.cloudinary.com/fake/image/upload/fake.jpg',
    }),
    // Reflects the number of "pictures" files sent, so multi-image tests
    // can check response.body.pictures.length.
    uploadImages: jest.fn().mockImplementation((files) => {
        if (!files || !files.pictures) return Promise.resolve([]);
        const pictureFiles = Array.isArray(files.pictures)
            ? files.pictures
            : [files.pictures];
        return Promise.resolve(
            pictureFiles.map((_, index) => ({
                public_id: `vinted/offers/fake-picture-${index}`,
                secure_url: `https://res.cloudinary.com/fake/image/upload/fake-picture-${index}.jpg`,
            }))
        );
    }),
    removeImage: jest.fn().mockResolvedValue(undefined),
    deleteFolder: jest.fn().mockResolvedValue(undefined),
}));

// Wraps the real implementations so rollback tests can force a single write
// to fail (mockRejectedValueOnce) while every other call behaves normally.
jest.mock('../utils/mongooseOrThrow', () => {
    const actual = jest.requireActual('../utils/mongooseOrThrow');
    return {
        ...actual,
        save: jest.fn(actual.save),
        findOneAndUpdateOrThrow: jest.fn(actual.findOneAndUpdateOrThrow),
        findByIdAndUpdateOrThrow: jest.fn(actual.findByIdAndUpdateOrThrow),
    };
});

// A small buffer is enough: express-fileupload only needs a file present
// under the "picture" field, its content is never read by the mock.
const attachPicture = (req) =>
    req.attach('picture', Buffer.from('fake-image'), 'picture.jpg');

// Attaches `count` files under the "pictures" field: express-fileupload
// automatically groups them into an array when several files share the
// same field name.
const attachPictures = (req, count) => {
    for (let i = 0; i < count; i++) {
        req.attach(
            'pictures',
            Buffer.from(`fake-image-${i}`),
            `picture-${i}.jpg`
        );
    }
    return req;
};

let token;

beforeAll(async () => {
    await connect();
});

beforeEach(async () => {
    const signupResponse = await request(app).post('/users/signup').send({
        email: 'seller@example.com',
        password: 'secret123',
        username: 'seller',
    });
    token = signupResponse.body.token;
});

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

describe('POST /offers/publish', () => {
    // No DB touched: isAuthenticated returns 401 before even checking the token in the DB
    it('requires authentication', async () => {
        const response = await request(app)
            .post('/offers/publish')
            .field('title', 'Jacket');

        expect(response.status).toBe(401);
    });

    it('publishes an offer', async () => {
        const response = await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition, worn a few times')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );

        expect(response.status).toBe(201);
        expect(response.body.name).toBe('Vintage jacket');
        expect(response.body.price).toBe(25);
        expect(response.body.owner.account.username).toBe('seller');
    });

    it('rejects a missing title', async () => {
        const response = await request(app)
            .post('/offers/publish')
            .set('Authorization', `Bearer ${token}`)
            .field('description', 'Good condition')
            .field('price', '25');

        expect(response.status).toBe(400);
    });

    it('publishes an offer with secondary pictures', async () => {
        const response = await attachPictures(
            attachPicture(
                request(app)
                    .post('/offers/publish')
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition, worn a few times')
                    .field('price', '25')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            ),
            3
        );

        expect(response.status).toBe(201);
        expect(response.body.pictures).toHaveLength(3);
    });

    it('rejects more than the max number of secondary pictures', async () => {
        const response = await attachPictures(
            attachPicture(
                request(app)
                    .post('/offers/publish')
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition, worn a few times')
                    .field('price', '25')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            ),
            6
        );

        expect(response.status).toBe(400);
    });

    it('attempts no cleanup when the main image upload itself fails', async () => {
        cloudinary.uploadImage.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition, worn a few times')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // Nothing was uploaded yet, so there is nothing to roll back
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore
        );
    });

    it('rolls back the main image when uploading secondary pictures fails', async () => {
        cloudinary.uploadImages.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .post('/offers/publish')
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition, worn a few times')
                    .field('price', '25')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(cloudinary.removeImage).toHaveBeenCalledWith(
            'vinted/offers/fake'
        );
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 1
        );
    });

    it('rolls back all uploaded images when saving the offer fails', async () => {
        mongooseOrThrow.save.mockRejectedValueOnce(new Error('db failed'));
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .post('/offers/publish')
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition, worn a few times')
                    .field('price', '25')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // 1 main image + 2 secondary pictures
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 3
        );
    });
});

describe('GET /offers', () => {
    beforeEach(async () => {
        await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );
    });

    it('lists offers', async () => {
        const response = await request(app).get('/offers');

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(1);
        expect(response.body.page).toBe(1);
        expect(response.body.totalPages).toBe(1);
        expect(response.body.offers).toHaveLength(1);
    });

    it('filters out offers outside the given price range', async () => {
        const response = await request(app).get(
            '/offers?priceMin=100&priceMax=200'
        );

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(0);
        expect(response.body.totalPages).toBe(0);
    });
});

describe('GET /offers/:id', () => {
    // No DB touched: the malformed id is rejected before any call to Offer.findById
    it('rejects a malformed id', async () => {
        const response = await request(app).get('/offers/not-a-valid-id');

        expect(response.status).toBe(400);
    });

    it('returns 404 for a well-formed but non-existent id', async () => {
        const response = await request(app).get(
            '/offers/507f1f77bcf86cd799439011'
        );

        expect(response.status).toBe(404);
    });
});

// Behaviors common to PUT and PATCH /offers/:id: auth required, rejected if
// not the owner, 404 if the offer doesn't exist. `attachFields` receives an
// already-built supertest request (method + url) and adds valid fields to
// it so that only authentication/ownership/existence is being tested.
const testsCommonToUpdateMethods = (method, getOfferId, attachFields) => {
    // No DB touched: isAuthenticated returns 401 before even checking the token in the DB
    it('requires authentication', async () => {
        const response = await attachFields(
            request(app)[method](`/offers/${getOfferId()}`)
        );

        expect(response.status).toBe(401);
    });

    // The ownership check and the write are done in a single atomic request
    // ({_id, owner}): an existing offer that doesn't belong to the user is
    // thus indistinguishable from a nonexistent offer (404), so as not to
    // reveal its existence to a third party.
    it('returns 404 for an update by a user who is not the owner', async () => {
        const otherSignup = await request(app).post('/users/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });

        const response = await attachFields(
            request(app)
                [method](`/offers/${getOfferId()}`)
                .set('Authorization', `Bearer ${otherSignup.body.token}`)
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for a well-formed but non-existent id', async () => {
        const response = await attachFields(
            request(app)
                [method]('/offers/507f1f77bcf86cd799439011')
                .set('Authorization', `Bearer ${token}`)
        );

        expect(response.status).toBe(404);
    });
};

describe('PUT /offers/:id', () => {
    let offerId;

    beforeEach(async () => {
        const publishResponse = await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition, worn a few times')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );
        offerId = publishResponse.body._id;
    });

    // PUT requires every field (full replacement), including the image
    testsCommonToUpdateMethods(
        'put',
        () => offerId,
        (req) =>
            attachPicture(
                req
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition, worn a few times')
                    .field('price', '30')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            )
    );

    it('rejects a missing title', async () => {
        const response = await attachPicture(
            request(app)
                .put(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`)
                .field('description', 'Good condition')
                .field('price', '30')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );

        expect(response.status).toBe(400);
    });

    it('fully replaces the offer', async () => {
        const response = await attachPicture(
            request(app)
                .put(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Updated jacket')
                .field('description', 'Updated description')
                .field('price', '40')
                .field('brand', 'Nike')
                .field('size', 'L')
                .field('color', 'Black')
                .field('condition', 'New')
                .field('city', 'Lyon')
        );

        expect(response.status).toBe(200);
        expect(response.body.name).toBe('Updated jacket');
        expect(response.body.price).toBe(40);

        const { details } = response.body;
        expect(details.brand).toBe('Nike');
        expect(details.size).toBe('L');
        expect(details.color).toBe('Black');
        expect(details.condition).toBe('New');
        expect(details.city).toBe('Lyon');
    });

    it('attempts no cleanup when the new main image upload itself fails', async () => {
        cloudinary.uploadImage.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPicture(
            request(app)
                .put(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Updated jacket')
                .field('description', 'Updated description')
                .field('price', '40')
                .field('brand', 'Nike')
                .field('size', 'L')
                .field('color', 'Black')
                .field('condition', 'New')
                .field('city', 'Lyon')
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // Nothing was uploaded yet, so there is nothing to roll back
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore
        );
    });

    it('rolls back the new main image when uploading secondary pictures fails', async () => {
        cloudinary.uploadImages.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .put(`/offers/${offerId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Updated jacket')
                    .field('description', 'Updated description')
                    .field('price', '40')
                    .field('brand', 'Nike')
                    .field('size', 'L')
                    .field('color', 'Black')
                    .field('condition', 'New')
                    .field('city', 'Lyon')
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(cloudinary.removeImage).toHaveBeenCalledWith(
            'vinted/offers/fake'
        );
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 1
        );
    });

    it('rolls back all newly uploaded images when the update write fails', async () => {
        mongooseOrThrow.findOneAndUpdateOrThrow.mockRejectedValueOnce(
            new Error('db failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .put(`/offers/${offerId}`)
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Updated jacket')
                    .field('description', 'Updated description')
                    .field('price', '40')
                    .field('brand', 'Nike')
                    .field('size', 'L')
                    .field('color', 'Black')
                    .field('condition', 'New')
                    .field('city', 'Lyon')
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // 1 new main image + 2 new secondary pictures
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 3
        );
    });
});

describe('PATCH /offers/:id', () => {
    let offerId;

    beforeEach(async () => {
        const publishResponse = await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition, worn a few times')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );
        offerId = publishResponse.body._id;
    });

    testsCommonToUpdateMethods(
        'patch',
        () => offerId,
        (req) => req.field('price', '30')
    );

    it('updates a single top-level field without touching the others', async () => {
        const response = await request(app)
            .patch(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('price', '30');

        expect(response.status).toBe(200);
        expect(response.body.price).toBe(30);
        expect(response.body.name).toBe('Vintage jacket');
    });

    it('merges a single details field instead of replacing the whole object', async () => {
        const response = await request(app)
            .patch(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('brand', 'Nike');

        expect(response.status).toBe(200);

        const { details } = response.body;
        expect(details.brand).toBe('Nike');
        // The other details, not sent in this PATCH, must be preserved
        expect(details.size).toBe('M');
        expect(details.color).toBe('Blue');
        expect(details.condition).toBe('Good');
        expect(details.city).toBe('Paris');
    });

    it('replaces the whole set of secondary pictures when "pictures" is sent', async () => {
        const firstResponse = await attachPictures(
            request(app)
                .patch(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`),
            2
        );
        expect(firstResponse.status).toBe(200);
        expect(firstResponse.body.pictures).toHaveLength(2);

        const secondResponse = await attachPictures(
            request(app)
                .patch(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`),
            1
        );
        expect(secondResponse.status).toBe(200);
        expect(secondResponse.body.pictures).toHaveLength(1);
    });

    it('leaves pictures untouched when "pictures" is not sent', async () => {
        await attachPictures(
            request(app)
                .patch(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`),
            2
        );

        const response = await request(app)
            .patch(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('price', '35');

        expect(response.status).toBe(200);
        expect(response.body.pictures).toHaveLength(2);
    });

    it('attempts no cleanup when the new main image upload itself fails', async () => {
        cloudinary.uploadImage.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPicture(
            request(app)
                .patch(`/offers/${offerId}`)
                .set('Authorization', `Bearer ${token}`)
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // Nothing was uploaded yet, so there is nothing to roll back
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore
        );
    });

    it('rolls back the new main image when uploading secondary pictures fails', async () => {
        cloudinary.uploadImages.mockRejectedValueOnce(
            new Error('upload failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .patch(`/offers/${offerId}`)
                    .set('Authorization', `Bearer ${token}`)
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(cloudinary.removeImage).toHaveBeenCalledWith(
            'vinted/offers/fake'
        );
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 1
        );
    });

    it('rolls back all newly uploaded images when the update write fails', async () => {
        mongooseOrThrow.findByIdAndUpdateOrThrow.mockRejectedValueOnce(
            new Error('db failed')
        );
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await attachPictures(
            attachPicture(
                request(app)
                    .patch(`/offers/${offerId}`)
                    .set('Authorization', `Bearer ${token}`)
            ),
            2
        );

        expect(response.status).toBeGreaterThanOrEqual(400);
        // 1 new main image + 2 new secondary pictures
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 3
        );
    });
});

describe('DELETE /offers/:id', () => {
    let offerId;

    beforeEach(async () => {
        const publishResponse = await attachPicture(
            request(app)
                .post('/offers/publish')
                .set('Authorization', `Bearer ${token}`)
                .field('title', 'Vintage jacket')
                .field('description', 'Good condition')
                .field('price', '25')
                .field('brand', "Levi's")
                .field('size', 'M')
                .field('color', 'Blue')
                .field('condition', 'Good')
                .field('city', 'Paris')
        );
        offerId = publishResponse.body._id;
    });

    // See the equivalent comment in testsCommonToUpdateMethods: 404, not
    // 403, since the ownership check and the deletion are a single
    // atomic request ({_id, owner}).
    it('returns 404 for a deletion by a user who is not the owner', async () => {
        const otherSignup = await request(app).post('/users/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });

        const response = await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${otherSignup.body.token}`);

        expect(response.status).toBe(404);
    });

    it('allows the owner to delete their own offer', async () => {
        const response = await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
    });

    it('cleans up the main image, all secondary pictures and the folder', async () => {
        const publishResponse = await attachPictures(
            attachPicture(
                request(app)
                    .post('/offers/publish')
                    .set('Authorization', `Bearer ${token}`)
                    .field('title', 'Vintage jacket')
                    .field('description', 'Good condition')
                    .field('price', '25')
                    .field('brand', "Levi's")
                    .field('size', 'M')
                    .field('color', 'Blue')
                    .field('condition', 'Good')
                    .field('city', 'Paris')
            ),
            2
        );
        const offerWithPicturesId = publishResponse.body._id;

        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;
        const deleteFolderCallsBefore =
            cloudinary.deleteFolder.mock.calls.length;

        const response = await request(app)
            .delete(`/offers/${offerWithPicturesId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        // 1 main image + 2 pictures
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 3
        );
        expect(cloudinary.deleteFolder.mock.calls.length).toBe(
            deleteFolderCallsBefore + 1
        );
    });
});

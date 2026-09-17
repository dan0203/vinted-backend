const request = require('supertest');
const app = require('../app');
const {
    connect,
    clearDatabase,
    closeDatabase,
    activateUser,
} = require('./setupTestDb');
const cloudinary = require('../utils/cloudinary');
const email = require('../utils/email');
const User = require('../models/User');
const Offer = require('../models/Offer');
const { MAX_TOKEN_AGE_MS, MAX_LOGIN_ATTEMPTS } = require('../utils/constants');

// Mocks the Resend wrapper for signup/confirm/resend so no real network
// call is made and tests can assert on which emails were sent.
jest.mock('../utils/email', () => ({
    sendConfirmationEmail: jest.fn().mockResolvedValue(undefined),
    sendNewsletterWelcomeEmail: jest.fn().mockResolvedValue(undefined),
}));

// Mocks Cloudinary for PUT/PATCH /users/:id (avatar) and, indirectly, for
// the DELETE cascade that goes through offer.service (publishing/removing offers).
jest.mock('../utils/cloudinary', () => ({
    uploadImage: jest.fn().mockResolvedValue({
        public_id: 'vinted/offers/fake',
        secure_url: 'https://res.cloudinary.com/fake/image/upload/fake.jpg',
    }),
    uploadImages: jest.fn().mockResolvedValue([]),
    uploadAvatar: jest.fn().mockImplementation((files) => {
        if (!files || !files.avatar) return Promise.resolve(undefined);
        return Promise.resolve({
            public_id: 'vinted/users/fake-avatar',
            secure_url:
                'https://res.cloudinary.com/fake/image/upload/fake-avatar.jpg',
        });
    }),
    removeImage: jest.fn().mockResolvedValue(undefined),
    deleteFolder: jest.fn().mockResolvedValue(undefined),
}));

beforeAll(async () => {
    await connect();
});

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

describe('POST /users/signup', () => {
    it('creates an account with valid data', async () => {
        const response = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });

        expect(response.status).toBe(201);
        expect(response.body).toHaveProperty('token');
        expect(response.body.account.username).toBe('jane');
    });

    // This test never touches the DB: Joi rejects the request before any Mongo access
    it('rejects a missing email', async () => {
        const response = await request(app).post('/users/signup').send({
            password: 'secret123',
            username: 'jane',
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/email/i);
    });

    it('rejects a duplicate email', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });

        const response = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'otherPass1',
            username: 'jane2',
        });

        expect(response.status).toBe(409);
    });

    it('creates the account inactive and sends a confirmation email', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });

        const user = await User.findOne({ email: 'jane@example.com' });
        expect(user.active).toBe(false);
        expect(email.sendConfirmationEmail).toHaveBeenCalledWith(
            'jane@example.com',
            user.confirmationToken
        );
    });
});

describe('POST /users/login', () => {
    beforeEach(async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        await activateUser('jane@example.com');
    });

    it('logs in with correct credentials', async () => {
        const response = await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
    });

    it('rejects a wrong password', async () => {
        const response = await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'wrongPassword',
        });

        expect(response.status).toBe(403);
    });

    it('rejects an unknown email', async () => {
        const response = await request(app).post('/users/login').send({
            email: 'unknown@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(403);
    });

    it('locks the account after too many failed attempts, even with the right password', async () => {
        for (let i = 0; i < MAX_LOGIN_ATTEMPTS; i++) {
            await request(app).post('/users/login').send({
                email: 'jane@example.com',
                password: 'wrongPassword',
            });
        }

        const response = await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(423);
    });

    it('resets the failed attempt counter after a successful login', async () => {
        await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'wrongPassword',
        });

        const success = await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'secret123',
        });
        expect(success.status).toBe(200);

        for (let i = 0; i < MAX_LOGIN_ATTEMPTS - 1; i++) {
            const response = await request(app).post('/users/login').send({
                email: 'jane@example.com',
                password: 'wrongPassword',
            });
            expect(response.status).toBe(403);
        }
    });

    it('rejects login on an unconfirmed account, after password verification succeeds', async () => {
        await request(app).post('/users/signup').send({
            email: 'unconfirmed@example.com',
            password: 'secret123',
            username: 'unconfirmed',
        });

        const wrongPassword = await request(app).post('/users/login').send({
            email: 'unconfirmed@example.com',
            password: 'wrongPassword',
        });
        expect(wrongPassword.status).toBe(403);
        expect(wrongPassword.body.message).toBe('Unauthorized');

        const response = await request(app).post('/users/login').send({
            email: 'unconfirmed@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(403);
        expect(response.body.message).toMatch(/confirm/i);
    });
});

describe('authenticated routes on an unconfirmed account', () => {
    it('rejects a signup-issued token with 403', async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'unconfirmed@example.com',
            password: 'secret123',
            username: 'unconfirmed',
        });

        const response = await request(app)
            .patch(`/users/${signupResponse.body._id}`)
            .set('Authorization', `Bearer ${signupResponse.body.token}`)
            .field('newsletter', 'true');

        expect(response.status).toBe(403);
        expect(response.body.message).toMatch(/confirm/i);
    });
});

describe('GET /users/confirm/:token', () => {
    it('activates the account, clears the token, and allows login', async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        const user = await User.findOne({ email: 'jane@example.com' });

        const response = await request(app).get(
            `/users/confirm/${user.confirmationToken}`
        );

        expect(response.status).toBe(200);
        expect(response.body.active).toBe(true);

        const confirmedUser = await User.findById(signupResponse.body._id);
        expect(confirmedUser.confirmationToken).toBeNull();

        const login = await request(app).post('/users/login').send({
            email: 'jane@example.com',
            password: 'secret123',
        });
        expect(login.status).toBe(200);
    });

    it('rejects an unknown token and leaves the account inactive', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });

        const response = await request(app).get(
            '/users/confirm/not-a-real-token'
        );

        expect(response.status).toBe(400);

        const user = await User.findOne({ email: 'jane@example.com' });
        expect(user.active).toBe(false);
    });

    it('rejects an expired token and leaves the account inactive', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        const user = await User.findOne({ email: 'jane@example.com' });
        await User.findByIdAndUpdate(user._id, {
            confirmationTokenExpiresAt: new Date(Date.now() - 1000),
        });

        const response = await request(app).get(
            `/users/confirm/${user.confirmationToken}`
        );

        expect(response.status).toBe(400);

        const stillInactive = await User.findById(user._id);
        expect(stillInactive.active).toBe(false);
    });

    it('sends the newsletter welcome email only when newsletter is true', async () => {
        await request(app).post('/users/signup').send({
            email: 'subscriber@example.com',
            password: 'secret123',
            username: 'subscriber',
            newsletter: true,
        });
        const subscriber = await User.findOne({
            email: 'subscriber@example.com',
        });

        await request(app).post('/users/signup').send({
            email: 'nonsubscriber@example.com',
            password: 'secret123',
            username: 'nonsubscriber',
        });
        const nonSubscriber = await User.findOne({
            email: 'nonsubscriber@example.com',
        });

        await request(app).get(
            `/users/confirm/${subscriber.confirmationToken}`
        );
        expect(email.sendNewsletterWelcomeEmail).toHaveBeenCalledWith(
            'subscriber@example.com'
        );

        const callsBefore = email.sendNewsletterWelcomeEmail.mock.calls.length;
        await request(app).get(
            `/users/confirm/${nonSubscriber.confirmationToken}`
        );
        expect(email.sendNewsletterWelcomeEmail.mock.calls.length).toBe(
            callsBefore
        );
    });
});

describe('POST /users/confirm/resend', () => {
    it('re-sends a fresh confirmation email for an inactive account', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        const originalUser = await User.findOne({
            email: 'jane@example.com',
        });

        const response = await request(app)
            .post('/users/confirm/resend')
            .send({ email: 'jane@example.com' });

        expect(response.status).toBe(200);

        const updatedUser = await User.findOne({ email: 'jane@example.com' });
        expect(updatedUser.confirmationToken).not.toBe(
            originalUser.confirmationToken
        );
        expect(email.sendConfirmationEmail).toHaveBeenCalledWith(
            'jane@example.com',
            updatedUser.confirmationToken
        );
    });

    it('returns the same 200 for an unknown email, without sending anything', async () => {
        const callsBefore = email.sendConfirmationEmail.mock.calls.length;

        const response = await request(app)
            .post('/users/confirm/resend')
            .send({ email: 'unknown@example.com' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: 'Confirmation email sent' });
        expect(email.sendConfirmationEmail.mock.calls.length).toBe(callsBefore);
    });

    it('returns the same 200 for an already-active account, without sending anything', async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        await activateUser('jane@example.com');
        const callsBefore = email.sendConfirmationEmail.mock.calls.length;

        const response = await request(app)
            .post('/users/confirm/resend')
            .send({ email: 'jane@example.com' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ message: 'Confirmation email sent' });
        expect(email.sendConfirmationEmail.mock.calls.length).toBe(callsBefore);
    });
});

// Behaviors common to PUT/PATCH/DELETE /users/:id: auth required, and 403
// (not 404, unlike offers — see user.service.js) if the id in the URL
// isn't the authenticated user's own.
const testsCommonToSelfOnlyMethods = (method, getUserId, attachFields) => {
    it('requires authentication', async () => {
        const response = await attachFields(
            request(app)[method](`/users/${getUserId()}`)
        );

        expect(response.status).toBe(401);
    });

    it('returns 403 when the id is not the authenticated user', async () => {
        const otherSignup = await request(app).post('/users/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });
        await activateUser('other@example.com');

        const response = await attachFields(
            request(app)
                [method](`/users/${getUserId()}`)
                .set('Authorization', `Bearer ${otherSignup.body.token}`)
        );

        expect(response.status).toBe(403);
    });
};

describe('PUT /users/:id', () => {
    let userId;
    let token;

    beforeEach(async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        userId = signupResponse.body._id;
        token = signupResponse.body.token;
        await activateUser('jane@example.com');
    });

    testsCommonToSelfOnlyMethods(
        'put',
        () => userId,
        (req) => req.field('username', 'newjane')
    );

    it('rejects a missing username', async () => {
        const response = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(400);
    });

    it('replaces the username', async () => {
        const response = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'newjane');

        expect(response.status).toBe(200);
        expect(response.body.account.username).toBe('newjane');
    });

    it('uploads a new avatar and removes the previous one', async () => {
        const first = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'jane')
            .attach('avatar', Buffer.from('fake-avatar'), 'avatar.jpg');

        expect(first.status).toBe(200);
        expect(first.body.account.avatar).toBeTruthy();

        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const second = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'jane')
            .attach('avatar', Buffer.from('fake-avatar-2'), 'avatar2.jpg');

        expect(second.status).toBe(200);
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 1
        );
    });

    it('does not clear the avatar when a PUT omits it', async () => {
        await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'jane')
            .attach('avatar', Buffer.from('fake-avatar'), 'avatar.jpg');

        const response = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'jane-again');

        expect(response.status).toBe(200);
        expect(response.body.account.avatar).toBeTruthy();
    });
});

describe('token expiration', () => {
    it('rejects a token older than the max age', async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'expired@example.com',
            password: 'secret123',
            username: 'expired',
        });
        const userId = signupResponse.body._id;
        const token = signupResponse.body.token;

        await User.findByIdAndUpdate(userId, {
            active: true,
            tokenIssuedAt: new Date(Date.now() - MAX_TOKEN_AGE_MS - 1000),
        });

        const response = await request(app)
            .put(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('username', 'stillexpired');

        expect(response.status).toBe(401);
    });
});

describe('PATCH /users/:id', () => {
    let userId;
    let token;

    beforeEach(async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        userId = signupResponse.body._id;
        token = signupResponse.body.token;
        await activateUser('jane@example.com');
    });

    testsCommonToSelfOnlyMethods(
        'patch',
        () => userId,
        (req) => req.field('username', 'newjane')
    );

    it('rejects when no data is sent', async () => {
        const response = await request(app)
            .patch(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(400);
    });

    it('updates newsletter without touching the username', async () => {
        const response = await request(app)
            .patch(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('newsletter', 'true');

        expect(response.status).toBe(200);
        expect(response.body.newsletter).toBe(true);
        expect(response.body.account.username).toBe('jane');
    });
});

describe('DELETE /users/:id', () => {
    let userId;
    let token;

    beforeEach(async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        userId = signupResponse.body._id;
        token = signupResponse.body.token;
        await activateUser('jane@example.com');
    });

    testsCommonToSelfOnlyMethods(
        'delete',
        () => userId,
        (req) => req
    );

    it('deletes the account and cascades to its own offers', async () => {
        await request(app)
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
            .attach('picture', Buffer.from('fake-image'), 'picture.jpg');

        const response = await request(app)
            .delete(`/users/${userId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);

        const offers = await request(app).get('/offers');
        expect(offers.body.count).toBe(0);
    });

    it("removes a deleted offer from another user's favorites", async () => {
        const otherSignup = await request(app).post('/users/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });
        await activateUser('other@example.com');
        const otherId = otherSignup.body._id;
        const otherToken = otherSignup.body.token;

        const publishResponse = await request(app)
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
            .attach('picture', Buffer.from('fake-image'), 'picture.jpg');
        const offerId = publishResponse.body._id;

        await request(app)
            .post(`/users/${otherId}/favorites/${offerId}`)
            .set('Authorization', `Bearer ${otherToken}`);

        await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`);

        const favorites = await request(app)
            .get(`/users/${otherId}/favorites`)
            .set('Authorization', `Bearer ${otherToken}`);

        expect(favorites.body.favorites).toHaveLength(0);
    });
});

describe('favorites', () => {
    let userId;
    let token;
    let otherId;
    let otherToken;
    let offerId;

    beforeEach(async () => {
        const signupResponse = await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
        userId = signupResponse.body._id;
        token = signupResponse.body.token;
        await activateUser('jane@example.com');

        const otherSignup = await request(app).post('/users/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });
        otherId = otherSignup.body._id;
        otherToken = otherSignup.body.token;
        await activateUser('other@example.com');

        const publishResponse = await request(app)
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
            .attach('picture', Buffer.from('fake-image'), 'picture.jpg');
        offerId = publishResponse.body._id;
    });

    describe('POST /users/:id/favorites/:offerId', () => {
        it('requires authentication', async () => {
            const response = await request(app).post(
                `/users/${userId}/favorites/${offerId}`
            );

            expect(response.status).toBe(401);
        });

        it('returns 403 when the id is not the authenticated user', async () => {
            const response = await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });

        it("adds the offer to the caller's favorites", async () => {
            const response = await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toContain(offerId);
        });

        it('is a no-op when the offer is already favorited', async () => {
            await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            const response = await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(1);
        });

        it('returns 404 for a non-existent offer', async () => {
            const response = await request(app)
                .post(`/users/${userId}/favorites/507f1f77bcf86cd799439011`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(404);
        });

        it('rejects a malformed offer id', async () => {
            const response = await request(app)
                .post(`/users/${userId}/favorites/not-a-valid-id`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(400);
        });
    });

    describe('DELETE /users/:id/favorites/:offerId', () => {
        it('requires authentication', async () => {
            const response = await request(app).delete(
                `/users/${userId}/favorites/${offerId}`
            );

            expect(response.status).toBe(401);
        });

        it('returns 403 when the id is not the authenticated user', async () => {
            const response = await request(app)
                .delete(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });

        it('removes a favorited offer', async () => {
            await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            const response = await request(app)
                .delete(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(0);
        });

        it('is a no-op when the offer was never favorited', async () => {
            const response = await request(app)
                .delete(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(0);
        });
    });

    describe('GET /users/:id/favorites', () => {
        it('requires authentication', async () => {
            const response = await request(app).get(
                `/users/${userId}/favorites`
            );

            expect(response.status).toBe(401);
        });

        it('returns 403 when the id is not the authenticated user', async () => {
            const response = await request(app)
                .get(`/users/${userId}/favorites`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(403);
        });

        it("returns the caller's favorited offers in the offer DTO shape", async () => {
            await request(app)
                .post(`/users/${userId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${token}`);

            const response = await request(app)
                .get(`/users/${userId}/favorites`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(1);
            expect(response.body.favorites[0]._id).toBe(offerId);
            expect(response.body.favorites[0].name).toBe('Vintage jacket');
            expect(response.body.favorites[0].owner.account.username).toBe(
                'jane'
            );
        });

        it('excludes offers favorited by other users', async () => {
            await request(app)
                .post(`/users/${otherId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${otherToken}`);

            const response = await request(app)
                .get(`/users/${userId}/favorites`)
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(0);
        });

        it('omits a favorite whose offer no longer exists instead of crashing', async () => {
            await request(app)
                .post(`/users/${otherId}/favorites/${offerId}`)
                .set('Authorization', `Bearer ${otherToken}`);

            // Simulates a dangling reference by deleting the offer directly,
            // bypassing offer.service.js's favorites cascade.
            await Offer.findByIdAndDelete(offerId);

            const response = await request(app)
                .get(`/users/${otherId}/favorites`)
                .set('Authorization', `Bearer ${otherToken}`);

            expect(response.status).toBe(200);
            expect(response.body.favorites).toHaveLength(0);
        });
    });

    it('still deletes the offer and cleans up its images if the favorites cascade fails', async () => {
        await request(app)
            .post(`/users/${otherId}/favorites/${offerId}`)
            .set('Authorization', `Bearer ${otherToken}`);

        const updateManySpy = jest
            .spyOn(User, 'updateMany')
            .mockRejectedValueOnce(new Error('db failed'));
        const removeImageCallsBefore = cloudinary.removeImage.mock.calls.length;

        const response = await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        expect(cloudinary.removeImage.mock.calls.length).toBeGreaterThan(
            removeImageCallsBefore
        );

        updateManySpy.mockRestore();
    });
});

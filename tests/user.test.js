const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');
const cloudinary = require('../utils/cloudinary');
const User = require('../models/User');
const { MAX_TOKEN_AGE_MS, MAX_LOGIN_ATTEMPTS } = require('../utils/constants');

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
});

describe('POST /users/login', () => {
    beforeEach(async () => {
        await request(app).post('/users/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
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
});

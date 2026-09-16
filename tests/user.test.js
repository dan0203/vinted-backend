const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');
const cloudinary = require('../utils/cloudinary');

// Mocke Cloudinary pour PUT/PATCH /users/:id (avatar) et, indirectement, pour
// la cascade DELETE qui passe par offer.service (publish/remove d'offres).
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

    // Ce test ne touche jamais la base : Joi rejette la requête avant tout accès Mongo
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
});

// Comportements communs à PUT/PATCH/DELETE /users/:id : auth requise, et 403
// (pas 404, contrairement aux offres — voir user.service.js) si l'id dans
// l'URL n'est pas celui de l'utilisateur authentifié.
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

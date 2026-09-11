const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');

beforeAll(async () => {
    await connect();
});

afterEach(async () => {
    await clearDatabase();
});

afterAll(async () => {
    await closeDatabase();
});

describe('POST /user/signup', () => {
    it('creates an account with valid data', async () => {
        const response = await request(app).post('/user/signup').send({
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
        const response = await request(app).post('/user/signup').send({
            password: 'secret123',
            username: 'jane',
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/email/i);
    });

    it('rejects a duplicate email', async () => {
        await request(app).post('/user/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });

        const response = await request(app).post('/user/signup').send({
            email: 'jane@example.com',
            password: 'otherPass1',
            username: 'jane2',
        });

        expect(response.status).toBe(409);
    });
});

describe('POST /user/login', () => {
    beforeEach(async () => {
        await request(app).post('/user/signup').send({
            email: 'jane@example.com',
            password: 'secret123',
            username: 'jane',
        });
    });

    it('logs in with correct credentials', async () => {
        const response = await request(app).post('/user/login').send({
            email: 'jane@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('token');
    });

    it('rejects a wrong password', async () => {
        const response = await request(app).post('/user/login').send({
            email: 'jane@example.com',
            password: 'wrongPassword',
        });

        expect(response.status).toBe(403);
    });

    it('rejects an unknown email', async () => {
        const response = await request(app).post('/user/login').send({
            email: 'unknown@example.com',
            password: 'secret123',
        });

        expect(response.status).toBe(403);
    });
});

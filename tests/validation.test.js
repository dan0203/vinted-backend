// Tests qui ne touchent jamais MongoDB : la validation (Joi ou manuelle) ou le
// middleware d'authentification rejettent la requête avant tout accès à la base.
// Utile pour tester rapidement, sans dépendre d'une connexion DB.
const request = require('supertest');
const app = require('../app');

describe('validation without a database connection', () => {
    it('POST /users/signup rejects a missing email (Joi)', async () => {
        const response = await request(app).post('/users/signup').send({
            password: 'secret123',
            username: 'jane',
        });

        expect(response.status).toBe(400);
        expect(response.body.message).toMatch(/email/i);
    });

    it('POST /users/login rejects a missing password (Joi)', async () => {
        const response = await request(app).post('/users/login').send({
            email: 'jane@example.com',
        });

        expect(response.status).toBe(400);
    });

    it('POST /offers/publish requires authentication', async () => {
        const response = await request(app)
            .post('/offers/publish')
            .field('title', 'Jacket');

        expect(response.status).toBe(401);
    });

    it('GET /offers/:id rejects a malformed id', async () => {
        const response = await request(app).get('/offers/not-a-valid-id');

        expect(response.status).toBe(400);
    });

    it('unknown route returns a JSON 404, not an HTML page', async () => {
        const response = await request(app).get('/does-not-exist');

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ message: 'The route does not exist' });
    });
});

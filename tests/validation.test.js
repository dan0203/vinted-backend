// Tests that never touch MongoDB: validation (Joi or manual) or the
// authentication middleware rejects the request before any DB access.
// Useful for testing quickly, without depending on a DB connection.
const request = require('supertest');
const app = require('../app');
const sanitizeMongo = require('../middlewares/sanitizeMongo');

describe('sanitizeMongo', () => {
    it('strips keys starting with $ and keys containing a dot, recursively', () => {
        const req = {
            body: {
                email: 'jane@example.com',
                $where: 'this.password.length > 0',
                filter: { $gt: '' },
                'a.b': 'value',
                nested: { safe: 'ok', $or: [{ a: 1 }] },
            },
        };
        const next = jest.fn();

        sanitizeMongo(req, {}, next);

        expect(req.body).toEqual({
            email: 'jane@example.com',
            filter: {},
            nested: { safe: 'ok' },
        });
        expect(next).toHaveBeenCalledTimes(1);
    });

    it('does nothing when body is absent', () => {
        const req = {};
        const next = jest.fn();

        expect(() => sanitizeMongo(req, {}, next)).not.toThrow();
        expect(next).toHaveBeenCalledTimes(1);
    });
});

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

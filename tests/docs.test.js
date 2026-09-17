const request = require('supertest');
const app = require('../app');

describe('GET /api-docs.json', () => {
    it('returns a valid OpenAPI 3 document listing the documented routes', async () => {
        const response = await request(app).get('/api-docs.json');

        expect(response.status).toBe(200);
        expect(response.body.openapi).toMatch(/^3\./);

        const paths = Object.keys(response.body.paths);
        expect(paths).toEqual(
            expect.arrayContaining([
                '/users/signup',
                '/users/login',
                '/users/{id}',
                '/users/{id}/favorites',
                '/users/{id}/favorites/{offerId}',
                '/offers',
                '/offers/publish',
                '/offers/{id}',
            ])
        );
    });
});

describe('GET /api-docs', () => {
    it('serves the interactive Swagger UI page', async () => {
        const response = await request(app).get('/api-docs/');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toMatch(/text\/html/);
    });
});

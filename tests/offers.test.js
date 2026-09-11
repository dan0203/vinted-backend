const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');

let token;

beforeAll(async () => {
    await connect();
});

beforeEach(async () => {
    const signupResponse = await request(app).post('/user/signup').send({
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
    // Pas de DB touchée : isAuthenticated renvoie 401 avant même d'aller vérifier le token en base
    it('requires authentication', async () => {
        const response = await request(app)
            .post('/offers/publish')
            .field('title', 'Jacket');

        expect(response.status).toBe(401);
    });

    it('publishes an offer without a picture', async () => {
        const response = await request(app)
            .post('/offers/publish')
            .set('Authorization', `Bearer ${token}`)
            .field('title', 'Vintage jacket')
            .field('description', 'Good condition, worn a few times')
            .field('price', '25')
            .field('brand', "Levi's")
            .field('size', 'M')
            .field('color', 'Blue')
            .field('condition', 'Good')
            .field('city', 'Paris');

        expect(response.status).toBe(201);
        expect(response.body.product_name).toBe('Vintage jacket');
        expect(response.body.product_price).toBe(25);
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
});

describe('GET /offers', () => {
    beforeEach(async () => {
        await request(app)
            .post('/offers/publish')
            .set('Authorization', `Bearer ${token}`)
            .field('title', 'Vintage jacket')
            .field('description', 'Good condition')
            .field('price', '25');
    });

    it('lists offers', async () => {
        const response = await request(app).get('/offers');

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(1);
        expect(response.body.offers).toHaveLength(1);
    });

    it('filters out offers outside the given price range', async () => {
        const response = await request(app).get(
            '/offers?priceMin=100&priceMax=200'
        );

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(0);
    });
});

describe('GET /offers/:id', () => {
    // Pas de DB touchée : le format d'id invalide est rejeté avant tout appel à Offer.findById
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

describe('DELETE /offers/:id', () => {
    let offerId;

    beforeEach(async () => {
        const publishResponse = await request(app)
            .post('/offers/publish')
            .set('Authorization', `Bearer ${token}`)
            .field('title', 'Vintage jacket')
            .field('description', 'Good condition')
            .field('price', '25');
        offerId = publishResponse.body._id;
    });

    it('refuses deletion by a user who is not the owner', async () => {
        const otherSignup = await request(app).post('/user/signup').send({
            email: 'other@example.com',
            password: 'secret123',
            username: 'other',
        });

        const response = await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${otherSignup.body.token}`);

        expect(response.status).toBe(403);
    });

    it('allows the owner to delete their own offer', async () => {
        const response = await request(app)
            .delete(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
    });
});

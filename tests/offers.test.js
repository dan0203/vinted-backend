const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');

// Le picture est obligatoire au publish/update : on mocke Cloudinary pour ne
// pas dépendre du réseau ni de vrais credentials pendant les tests.
jest.mock('../utils/cloudinary', () => ({
    uploadImage: jest.fn().mockResolvedValue({
        public_id: 'vinted/offers/fake',
        secure_url: 'https://res.cloudinary.com/fake/image/upload/fake.jpg',
    }),
    removeImage: jest.fn().mockResolvedValue(undefined),
}));

// Un petit buffer suffit : express-fileupload n'a besoin que d'un fichier
// présent sous le champ "picture", son contenu n'est jamais lu par le mock.
const attachPicture = (req) =>
    req.attach('picture', Buffer.from('fake-image'), 'picture.jpg');

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
    // Pas de DB touchée : isAuthenticated renvoie 401 avant même d'aller vérifier le token en base
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

// Comportements communs à PUT et PATCH /offers/:id : auth requise, refus si
// on n'est pas propriétaire, 404 si l'offre n'existe pas. `attachFields` reçoit
// une requête supertest déjà construite (méthode + url) et y ajoute des champs
// valides pour que seule l'authentification/l'ownership/l'existence soit testée.
const testsCommonToUpdateMethods = (method, getOfferId, attachFields) => {
    // Pas de DB touchée : isAuthenticated renvoie 401 avant même d'aller vérifier le token en base
    it('requires authentication', async () => {
        const response = await attachFields(
            request(app)[method](`/offers/${getOfferId()}`)
        );

        expect(response.status).toBe(401);
    });

    it('refuses an update by a user who is not the owner', async () => {
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

        expect(response.status).toBe(403);
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

    // PUT exige tous les champs (remplacement complet), y compris l'image
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
        expect(response.body.product_name).toBe('Updated jacket');
        expect(response.body.product_price).toBe(40);

        const details = Object.assign({}, ...response.body.product_details);
        expect(details.MARQUE).toBe('Nike');
        expect(details.TAILLE).toBe('L');
        expect(details.COULEUR).toBe('Black');
        expect(details.ÉTAT).toBe('New');
        expect(details.EMPLACEMENT).toBe('Lyon');
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
        expect(response.body.product_price).toBe(30);
        expect(response.body.product_name).toBe('Vintage jacket');
    });

    it('merges a single product_details field instead of replacing the whole array', async () => {
        const response = await request(app)
            .patch(`/offers/${offerId}`)
            .set('Authorization', `Bearer ${token}`)
            .field('brand', 'Nike');

        expect(response.status).toBe(200);

        const details = Object.assign({}, ...response.body.product_details);
        expect(details.MARQUE).toBe('Nike');
        // Les autres détails, non envoyés dans ce PATCH, doivent être préservés
        expect(details.TAILLE).toBe('M');
        expect(details.COULEUR).toBe('Blue');
        expect(details.ÉTAT).toBe('Good');
        expect(details.EMPLACEMENT).toBe('Paris');
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

    it('refuses deletion by a user who is not the owner', async () => {
        const otherSignup = await request(app).post('/users/signup').send({
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

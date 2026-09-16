const request = require('supertest');
const app = require('../app');
const { connect, clearDatabase, closeDatabase } = require('./setupTestDb');
const cloudinary = require('../utils/cloudinary');

// Le picture est obligatoire au publish/update : on mocke Cloudinary pour ne
// pas dépendre du réseau ni de vrais credentials pendant les tests.
jest.mock('../utils/cloudinary', () => ({
    uploadImage: jest.fn().mockResolvedValue({
        public_id: 'vinted/offers/fake',
        secure_url: 'https://res.cloudinary.com/fake/image/upload/fake.jpg',
    }),
    // Reflète le nombre de fichiers "pictures" envoyés, pour que les tests
    // multi-images puissent vérifier response.body.pictures.length.
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
    deleteOfferFolder: jest.fn().mockResolvedValue(undefined),
}));

// Un petit buffer suffit : express-fileupload n'a besoin que d'un fichier
// présent sous le champ "picture", son contenu n'est jamais lu par le mock.
const attachPicture = (req) =>
    req.attach('picture', Buffer.from('fake-image'), 'picture.jpg');

// Attache `count` fichiers sous le champ "pictures" : express-fileupload les
// regroupe automatiquement en tableau quand plusieurs fichiers partagent le
// même nom de champ.
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

    // L'ownership check et l'écriture sont faites en une seule requête atomique
    // ({_id, owner}) : une offre existante mais qui n'appartient pas à
    // l'utilisateur est donc indistinguable d'une offre inexistante (404),
    // pour ne pas révéler son existence à un tiers.
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
        expect(response.body.name).toBe('Updated jacket');
        expect(response.body.price).toBe(40);

        const { details } = response.body;
        expect(details.brand).toBe('Nike');
        expect(details.size).toBe('L');
        expect(details.color).toBe('Black');
        expect(details.condition).toBe('New');
        expect(details.city).toBe('Lyon');
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
        // Les autres détails, non envoyés dans ce PATCH, doivent être préservés
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

    // Voir le commentaire équivalent dans testsCommonToUpdateMethods : 404 et
    // non 403, l'ownership check et la suppression étant une seule requête
    // atomique ({_id, owner}).
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
            cloudinary.deleteOfferFolder.mock.calls.length;

        const response = await request(app)
            .delete(`/offers/${offerWithPicturesId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
        // 1 image principale + 2 pictures
        expect(cloudinary.removeImage.mock.calls.length).toBe(
            removeImageCallsBefore + 3
        );
        expect(cloudinary.deleteOfferFolder.mock.calls.length).toBe(
            deleteFolderCallsBefore + 1
        );
    });
});

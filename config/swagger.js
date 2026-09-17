const swaggerJsdoc = require('swagger-jsdoc');
const { name, version, description } = require('../package.json');

const options = {
    definition: {
        openapi: '3.0.0',
        info: { title: name, version, description },
        servers: [{ url: '/' }],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description:
                        'Short-lived JWT access token returned by signup/login/refresh, sent as `Authorization: Bearer <accessToken>`. Renew it with `POST /users/refresh` once it expires.',
                },
            },
            schemas: {
                Error: {
                    type: 'object',
                    properties: { message: { type: 'string' } },
                },
                Image: {
                    type: 'object',
                    properties: { secure_url: { type: 'string' } },
                },
                User: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        account: {
                            type: 'object',
                            properties: {
                                username: { type: 'string' },
                                avatar: { $ref: '#/components/schemas/Image' },
                            },
                        },
                        newsletter: { type: 'boolean' },
                    },
                },
                Offer: {
                    type: 'object',
                    properties: {
                        _id: { type: 'string' },
                        name: { type: 'string' },
                        description: { type: 'string' },
                        price: { type: 'number' },
                        details: {
                            type: 'object',
                            properties: {
                                brand: { type: 'string' },
                                size: { type: 'string' },
                                color: { type: 'string' },
                                condition: { type: 'string' },
                                city: { type: 'string' },
                            },
                        },
                        image: { $ref: '#/components/schemas/Image' },
                        pictures: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Image' },
                        },
                        owner: { $ref: '#/components/schemas/User' },
                        status: {
                            type: 'string',
                            enum: ['available', 'reserved', 'sold'],
                        },
                    },
                },
            },
        },
    },
    apis: ['./routes/*.route.js'],
};

module.exports = swaggerJsdoc(options);

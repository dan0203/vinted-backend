🇬🇧 **English** | 🇫🇷 [Français](./README.fr.md)

# Vinted Backend

A RESTful backend API for a Vinted-inspired second-hand clothing marketplace: token-based authentication, listing (offer) management with image upload, and search/filter with pagination.

![CI](https://github.com/dan0203/vinted-backend/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)

## Table of contents

- [About](#about)
- [Features](#features)
- [Tech stack](#tech-stack)
- [API reference](#api-reference)
- [Getting started](#getting-started)
- [Security](#security)
- [Known limitations / roadmap](#known-limitations--roadmap)
- [Project history](#project-history)
- [Related project](#related-project)
- [License](#license)

## About

This API was built during a full-stack bootcamp at [Le Réacteur](https://www.lereacteur.io/) (2026) as a clone of Vinted's core backend: user accounts, listing publication with image hosting, and a searchable/filterable catalog of offers. It's a learning project, not a production service — but it's built with the same patterns (layered architecture, centralized error handling, input validation, hashed passwords) that a real one would use.

The project was revisited in September 2026 for a dedicated hardening pass: password hashing migrated from SHA-256 to bcrypt, a ReDoS vector closed on the search endpoint, a broken global error handler fixed, and CI/linting added — see [Project history](#project-history).

No demo is currently deployed; see [Getting started](#getting-started) to run it locally.

## Features

- **Authentication**: signup and login with hashed passwords (bcrypt) and a Bearer token issued on success.
- **Authorization**: only the owner of an offer can update or delete it.
- **Listings (offers)**: publish, update, and delete a product listing, with a picture uploaded to Cloudinary.
- **Search & filtering**: filter offers by title (case-insensitive, ReDoS-safe), price range, and sort by price (ascending/descending), with pagination.
- **Centralized error handling**: every error carries an HTTP status and a JSON message; unexpected/internal errors are logged server-side but never leak their details to the client.

## Tech stack

| Category            | Choice                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / framework | Node.js, Express 5 (routing, middleware)                                                                                            |
| Database / ODM      | MongoDB, Mongoose                                                                                                                   |
| Validation          | [Joi](https://joi.dev/) (schema validation, `user` routes) + manual validation (`offer` routes)                                     |
| Auth                | Custom Bearer-token auth, [bcryptjs](https://github.com/dcodeIO/bcrypt.js) for password hashing, `uid2` for token/salt generation   |
| File upload         | [express-fileupload](https://github.com/richardgirges/express-fileupload) + [Cloudinary](https://cloudinary.com/) for image hosting |
| Tooling             | ESLint + Prettier, GitHub Actions CI (lint on every push/PR)                                                                        |

_(Utility packages like `cors` and `dotenv` are used for standard config/CORS handling and aren't listed as architectural choices.)_

## API reference

Base URL: `http://localhost:3000` (or your configured `PORT`). All request/response bodies are JSON, except `publish`/`update` which expect `multipart/form-data` (even when no picture is sent, since text fields must arrive as strings for the manual validation to work).

Authenticated routes expect an `Authorization: Bearer <token>` header, using the token returned by signup/login.

| Method | Route             | Auth            | Description                                                                                                                                                         |
| ------ | ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/user/signup`    | —               | Create an account. Body: `email`, `password` (min 6 chars), `username`, `newsletter` (optional).                                                                    |
| POST   | `/user/login`     | —               | Log in. Body: `email`, `password`.                                                                                                                                  |
| GET    | `/user/:id`       | —               | Get a user's public profile (`_id`, `account.username`, `account.avatar`, `newsletter`).                                                                            |
| POST   | `/offers/publish` | ✅              | Publish a new offer. `multipart/form-data`: `title`, `description`, `price`, `brand`, `size`, `color`, `condition`, `city`, and an optional `picture` file.         |
| GET    | `/offers`         | —               | List offers. Query params: `title`, `priceMin`, `priceMax`, `sort` (`price-asc` \| `price-desc`, default ascending), `page` (default 1, 20 per page).               |
| GET    | `/offers/:id`     | —               | Get a single offer.                                                                                                                                                 |
| PUT    | `/offers/:id`     | ✅ (owner only) | Update an offer. Same body as `publish` — the endpoint expects the full set of fields, not a partial update (see [Known limitations](#known-limitations--roadmap)). |
| DELETE | `/offers/:id`     | ✅ (owner only) | Delete an offer and its Cloudinary image.                                                                                                                           |

### Examples

Signup:

```bash
curl -X POST http://localhost:3000/user/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secret123","username":"jane"}'
```

```json
{
    "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
    "token": "aB3dE5fG7hJ9kL1mN2pQrStUvW",
    "account": { "username": "jane" }
}
```

Publish an offer (owner-only, `multipart/form-data`):

```bash
curl -X POST http://localhost:3000/offers/publish \
  -H "Authorization: Bearer aB3dE5fG7hJ9kL1mN2pQrStUvW" \
  -F "title=Vintage denim jacket" \
  -F "description=Good condition, worn a few times" \
  -F "price=25" \
  -F "brand=Levi's" \
  -F "size=M" \
  -F "color=Blue" \
  -F "condition=Good" \
  -F "city=Paris" \
  -F "picture=@jacket.jpg"
```

Search offers:

```bash
curl "http://localhost:3000/offers?title=jacket&priceMin=10&priceMax=50&sort=price-asc&page=1"
```

```json
{
    "count": 1,
    "offers": [
        {
            "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
            "product_name": "Vintage denim jacket",
            "product_price": 25,
            "product_details": [
                { "MARQUE": "Levi's" },
                { "TAILLE": "M" },
                { "COULEUR": "Blue" },
                { "ÉTAT": "Good" },
                { "EMPLACEMENT": "Paris" }
            ],
            "product_image": { "secure_url": "https://res.cloudinary.com/..." },
            "owner": { "_id": "...", "account": { "username": "jane" } }
        }
    ]
}
```

Error responses always look like:

```json
{ "message": "Title is mandatory" }
```

## Getting started

**Prerequisites**: Node.js 18+, a MongoDB database (e.g. a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster), and a free [Cloudinary](https://cloudinary.com/) account for image hosting.

```bash
git clone https://github.com/dan0203/vinted-backend.git
cd vinted-backend
npm install
cp .env.example .env
# fill in .env — see below
npm start
```

The server connects to MongoDB and Cloudinary on startup and refuses to start if the database connection fails.

### Environment variables

| Variable                | Description                                                                                                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONGODB_URI`           | MongoDB connection string (cluster only — the `vinted` database name is set in code via Mongoose's `dbName` option, so don't include a database name or trailing slash in the URI). |
| `CLOUDINARY_CLOUD_NAME` | From your Cloudinary dashboard.                                                                                                                                                     |
| `CLOUDINARY_API_KEY`    | From your Cloudinary dashboard.                                                                                                                                                     |
| `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard — keep this secret, never commit it.                                                                                                                 |
| `PORT`                  | Optional, defaults to `3000`.                                                                                                                                                       |

`.env` is git-ignored; `.env.example` documents the variable names. If you ever deploy this API (Render, Railway, etc.), set these same variables in that platform's environment/secrets settings — there's nothing framework-specific to prefix them with here, since this is a plain Node/Express backend using `dotenv` (unlike a Vite or Create React App frontend, which requires a `VITE_`/`REACT_APP_` prefix for a variable to be exposed to the browser).

## Security

- Passwords are hashed with **bcrypt** (10 salt rounds) — never stored or returned in plain text.
- Authentication uses a random opaque token (`uid2`) checked against the database on every request to a protected route, via the `isAuthenticated` middleware.
- Ownership is enforced server-side: updating or deleting an offer checks that the authenticated user is the offer's owner, independent of anything the client claims.
- Joi (user routes) and manual checks (offer routes) validate and sanitize input before it reaches the database.
- The title search endpoint escapes regex special characters before building the search pattern, closing a ReDoS vector (an unescaped user-supplied string used directly as a regex source can trigger catastrophic backtracking).
- The global error handler returns a generic `Internal server error` message for unexpected errors and logs the real error server-side only — it never leaks stack traces or internals to the client.
- Cloudinary response fields that could be sensitive (like `api_key`) are deliberately excluded from the stored image schema.

## Known limitations / roadmap

- **PUT vs PATCH**: `update` currently requires the full set of fields, matching a frontend that always submits a complete, pre-filled form (the case here). If a future client needs to change a single field (e.g. just the price) without resubmitting the whole form, this endpoint should move to `PATCH` with partial-update semantics.
- **CORS / payload size**: `cors()` currently accepts any origin, and `express.json()` has no explicit payload size limit. That's fine for a demo/portfolio project, but a production deployment should restrict CORS to specific origins and cap request body size.
- **Test coverage is partial**: a Jest/Supertest suite (20 tests) covers the `user` and `offers` routes — signup/login, ownership checks, filtering, validation errors — using an isolated in-memory MongoDB instance (`mongodb-memory-server`), no shared test database involved. Not yet covered: Cloudinary upload itself (tests exercise `publish`/`update` without attaching a picture) and the update (`PUT`) flow.
- **Partial indexing**: `product_price` now has an index (added to speed up sorting and range filtering as the dataset grows). `product_name` doesn't — the title search uses an unanchored, case-insensitive regex (`new RegExp(escapeRegex(title), 'i')`), which a standard index can't accelerate. A proper fix would be a MongoDB [text index](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/) with the `$text` operator, or a dedicated search engine (Atlas Search) — a real implementation change, not just an index to add.
- **Single image per offer**: the schema has a `product_pictures` array meant for multiple images, but it's currently always saved empty — only the single `product_image` field is populated. Multi-image upload isn't implemented yet.

## Project history

39 commits across two phases, visible in the commit history: an initial build in March 2026 (core API, Joi/manual validation, Cloudinary upload, ownership checks), and a dedicated hardening pass in September 2026 (bcrypt migration, ReDoS fix, a real bug in the global error middleware found and fixed, ESLint/Prettier, CI, `.env.example`). Single-branch workflow — no feature branches on this one, but the commit messages are descriptive and each change is scoped narrowly.

## Related project

[vinted-frontend](https://github.com/dan0203/vinted-frontend) is a React client built against this exact API contract (`/user/*`, `/offers/*`) — note that its checkout step calls Le Réacteur's shared payment endpoint directly rather than this backend, so the payment flow isn't self-contained end-to-end.

## License

[MIT](./LICENSE)

---

Built by [Dan Zerbib](https://github.com/dan0203) — [portfolio](https://dan0203.github.io)

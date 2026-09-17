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
- **Authorization**: only the owner of an offer, or the account itself, can update or delete it.
- **Listings (offers)**: publish, fully replace (PUT) or partially update (PATCH), and delete a product listing, with a main picture plus up to 5 secondary pictures uploaded to Cloudinary.
- **Accounts**: update your own username/avatar/newsletter (PUT/PATCH) or delete your own account (DELETE), which also removes all of your offers.
- **Search & filtering**: filter offers by title (case-insensitive, ReDoS-safe), price range, and sort by price (ascending/descending), with pagination.
- **Centralized error handling**: every error carries an HTTP status and a JSON message; unexpected/internal errors are logged server-side but never leak their details to the client.

## Tech stack

| Category            | Choice                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / framework | Node.js, Express 5 (routing, middleware)                                                                                            |
| Database / ODM      | MongoDB, Mongoose                                                                                                                   |
| Validation          | [Joi](https://joi.dev/) (schema validation, all routes)                                                                             |
| Auth                | Custom Bearer-token auth, [bcryptjs](https://github.com/dcodeIO/bcrypt.js) for password hashing, `uid2` for token/salt generation   |
| File upload         | [express-fileupload](https://github.com/richardgirges/express-fileupload) + [Cloudinary](https://cloudinary.com/) for image hosting |
| Tooling             | ESLint + Prettier, GitHub Actions CI (lint on every push/PR)                                                                        |

_(Utility packages like `cors` and `dotenv` are used for standard config/CORS handling and aren't listed as architectural choices.)_

## API reference

Base URL: `http://localhost:3000` (or your configured `PORT`). All request/response bodies are JSON, except `publish`/`PUT`/`PATCH` which expect `multipart/form-data` (required for file upload, even on requests that only send text fields).

Authenticated routes expect an `Authorization: Bearer <token>` header, using the token returned by signup/login.

| Method | Route                   | Auth            | Description                                                                                                                                                                                                                                                                                |
| ------ | ----------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/users/signup`         | —               | Create an account. Body: `email`, `password` (min 6 chars), `username`, `newsletter` (optional). The account starts inactive; login is blocked until the emailed confirmation link is followed.                                                                                            |
| POST   | `/users/login`          | —               | Log in. Body: `email`, `password`. Returns `403` if the account hasn't been confirmed yet.                                                                                                                                                                                                 |
| GET    | `/users/confirm/:token` | —               | Confirm an account from the link sent by signup/resend. Activates the account and, if `newsletter` was `true` at signup, sends a newsletter welcome email. `400` if the token is invalid or expired.                                                                                       |
| POST   | `/users/confirm/resend` | —               | Body: `email`. Re-sends a confirmation email for an existing, not-yet-active account. Always responds `200` with the same message regardless of whether the email is unknown, already active, or genuinely re-sent — this endpoint never reveals account existence or confirmation status. |
| POST   | `/users/reset/request`  | —               | Body: `email`. Sends a password reset code to a known account's email. Always responds `200` with the same message regardless of whether the email is known - this endpoint never reveals account existence.                                                                               |
| POST   | `/users/reset/confirm`  | —               | Body: `token`, `password` (min 6 chars). Sets a new password from a reset code sent by `reset/request`, and invalidates any previously issued bearer token. `400` if the token is invalid or expired.                                                                                      |
| GET    | `/users/:id`            | —               | Get a user's public profile (`_id`, `account.username`, `account.avatar`, `newsletter`).                                                                                                                                                                                                   |
| PUT    | `/users/:id`            | ✅ (self only)  | Replace a user's profile. `multipart/form-data`: `username` (required), optional `avatar` file and `newsletter` — omitting `avatar` leaves it unchanged, it's never cleared implicitly.                                                                                                    |
| PATCH  | `/users/:id`            | ✅ (self only)  | Partially update a user's profile — send only `username`, `avatar` and/or `newsletter`.                                                                                                                                                                                                    |
| DELETE | `/users/:id`            | ✅ (self only)  | Delete a user's own account, cascading to all of their offers (and Cloudinary images).                                                                                                                                                                                                     |
| POST   | `/offers/publish`       | ✅              | Publish a new offer. `multipart/form-data`: `title`, `description`, `price`, `brand`, `size`, `color`, `condition`, `city`, a required `picture` file, and up to 5 optional `pictures` files.                                                                                              |
| GET    | `/offers`               | —               | List offers. Query params: `title`, `priceMin`, `priceMax`, `sort` (`price-asc` \| `price-desc`, default ascending), `page` (default 1, 20 per page).                                                                                                                                      |
| GET    | `/offers/:id`           | —               | Get a single offer.                                                                                                                                                                                                                                                                        |
| PUT    | `/offers/:id`           | ✅ (owner only) | Replace an offer. Same body as `publish` — the full set of fields is required, `picture` included; omitting `pictures` clears the secondary images.                                                                                                                                        |
| PATCH  | `/offers/:id`           | ✅ (owner only) | Partially update an offer — send only the fields that change. `pictures`, if sent, replaces the whole secondary-image set; `picture` and `pictures` are independent of one another.                                                                                                        |
| DELETE | `/offers/:id`           | ✅ (owner only) | Delete an offer and all its Cloudinary images.                                                                                                                                                                                                                                             |

### Examples

Signup:

```bash
curl -X POST http://localhost:3000/users/signup \
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

Publish an offer (owner-only, `multipart/form-data`; `pictures` can be repeated up to 5 times for secondary images):

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
  -F "picture=@jacket.jpg" \
  -F "pictures=@jacket-back.jpg" \
  -F "pictures=@jacket-label.jpg"
```

Search offers:

```bash
curl "http://localhost:3000/offers?title=jacket&priceMin=10&priceMax=50&sort=price-asc&page=1"
```

```json
{
    "count": 1,
    "page": 1,
    "totalPages": 1,
    "offers": [
        {
            "_id": "66f1a2b3c4d5e6f7a8b9c0d2",
            "name": "Vintage denim jacket",
            "price": 25,
            "details": {
                "brand": "Levi's",
                "size": "M",
                "color": "Blue",
                "condition": "Good",
                "city": "Paris"
            },
            "image": { "secure_url": "https://res.cloudinary.com/..." },
            "pictures": [
                {
                    "secure_url": "https://res.cloudinary.com/.../jacket-back.jpg"
                },
                {
                    "secure_url": "https://res.cloudinary.com/.../jacket-label.jpg"
                }
            ],
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
| `RESEND_API_KEY`        | From your Resend dashboard — used to send confirmation, newsletter welcome, and password reset emails.                                                                              |
| `EMAIL_FROM`            | The "from" address used for outgoing emails (must be a verified sender/domain in Resend).                                                                                           |
| `BACKEND_URL`           | This API's own public base URL, used to build the confirmation link sent by email (e.g. `https://api.example.com`).                                                                 |
| `PORT`                  | Optional, defaults to `3000`.                                                                                                                                                       |

`.env` is git-ignored; `.env.example` documents the variable names. If you ever deploy this API (Render, Railway, etc.), set these same variables in that platform's environment/secrets settings — there's nothing framework-specific to prefix them with here, since this is a plain Node/Express backend using `dotenv` (unlike a Vite or Create React App frontend, which requires a `VITE_`/`REACT_APP_` prefix for a variable to be exposed to the browser).

## Security

- Passwords are hashed with **bcrypt** (10 salt rounds) — never stored or returned in plain text.
- Authentication uses a random opaque token (`uid2`) checked against the database on every request to a protected route, via the `isAuthenticated` middleware.
- Ownership is enforced server-side, atomically with the write itself (a single `findOneAndUpdate`/`findOneAndDelete` filtered by `{ _id, owner }`): an offer that exists but belongs to someone else returns `404`, the same as a non-existent one, so a non-owner can't distinguish the two. User account routes (`PUT`/`PATCH`/`DELETE /users/:id`) use `403` instead for the same mismatch — `GET /users/:id` is already public, so hiding an account's existence wouldn't add anything there.
- Joi validates and sanitizes input on every route before it reaches the database.
- The title search endpoint escapes regex special characters before building the search pattern, closing a ReDoS vector (an unescaped user-supplied string used directly as a regex source can trigger catastrophic backtracking).
- The global error handler returns a generic `Internal server error` message for unexpected errors and logs the real error server-side only — it never leaks stack traces or internals to the client.
- Cloudinary response fields that could be sensitive (like `api_key`) are deliberately excluded from the stored image schema.
- `helmet()` sets standard security headers and `x-powered-by` is disabled.
- `express.json()` is capped at 10kb and uploaded files at 5MB each; `cors()` is restricted to `FRONTEND_URL`.
- `/users/signup` and `/users/login` are rate limited (20 attempts per 15 minutes per IP).
- New accounts must confirm their email address before `login` or any authenticated route accepts their token — `login` only checks confirmation status after the password is verified, so a wrong password never reveals whether an account is confirmed. `POST /users/confirm/resend` responds identically whether the email is unknown, already active, or genuinely resent, so it can't be used to enumerate accounts either.

## Known limitations / roadmap

- **Test coverage is partial**: a Jest/Supertest suite covers the `user` and `offers` routes — signup/login, ownership checks, filtering, validation errors, the multi-image `pictures` field, PUT/PATCH/DELETE cleanup — using an isolated in-memory MongoDB instance (`mongodb-memory-server`), no shared test database involved. Cloudinary itself is mocked (`utils/cloudinary.js`), so the real network calls to Cloudinary's API aren't exercised.
- **Partial indexing**: `price` now has an index (added to speed up sorting and range filtering as the dataset grows). `name` doesn't — the title search uses an unanchored, case-insensitive regex (`new RegExp(escapeRegex(title), 'i')`), which a standard index can't accelerate. A proper fix would be a MongoDB [text index](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/) with the `$text` operator, or a dedicated search engine (Atlas Search) — a real implementation change, not just an index to add.

## Project history

39 commits across two phases, visible in the commit history: an initial build in March 2026 (core API, Joi/manual validation, Cloudinary upload, ownership checks), and a dedicated hardening pass in September 2026 (bcrypt migration, ReDoS fix, a real bug in the global error middleware found and fixed, ESLint/Prettier, CI, `.env.example`). Single-branch workflow — no feature branches on this one, but the commit messages are descriptive and each change is scoped narrowly.

## Related project

[vinted-frontend](https://github.com/dan0203/vinted-frontend) is a React client originally built against this API's `/users/*`/`/offers/*` routes — note that its checkout step calls Le Réacteur's shared payment endpoint directly rather than this backend, so the payment flow isn't self-contained end-to-end. The `offers` response shape was renamed since (see [API reference](#api-reference)); the frontend hasn't been updated to match yet.

## License

[MIT](./LICENSE)

---

Built by [Dan Zerbib](https://github.com/dan0203) — [portfolio](https://dan0203.github.io)

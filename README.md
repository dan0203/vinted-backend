🇬🇧 **English** | 🇫🇷 [Français](./README.fr.md)

# Vinted Backend

A RESTful backend API for a Vinted-inspired second-hand clothing marketplace: token-based authentication, listing (offer) management with image upload, and search/filter with pagination.

![CI](https://github.com/dan0203/vinted-backend/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-339933?logo=node.js&logoColor=white)
![Statements](https://img.shields.io/badge/statements-99.15%25-brightgreen.svg?style=flat)
![Branches](https://img.shields.io/badge/branches-93.13%25-brightgreen.svg?style=flat)
![Functions](https://img.shields.io/badge/functions-100%25-brightgreen.svg?style=flat)
![Lines](https://img.shields.io/badge/lines-99.13%25-brightgreen.svg?style=flat)

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

- **Authentication**: signup and login with hashed passwords (bcrypt); a short-lived JWT access token is returned in the response body and a rotating refresh token is delivered in an `httpOnly` cookie.
- **Authorization**: only the owner of an offer, or the account itself, can update or delete it.
- **Listings (offers)**: publish, fully replace (PUT) or partially update (PATCH), and delete a product listing, with a main picture plus up to 5 secondary pictures uploaded to Cloudinary.
- **Accounts**: update your own username/avatar/newsletter (PUT/PATCH) or delete your own account (DELETE), which also removes all of your offers.
- **Search & filtering**: filter offers by title (case-insensitive, ReDoS-safe), price range, and sort by price (ascending/descending), with pagination.
- **Favorites**: favorite/unfavorite an offer and list your own favorited offers, capped at 500 per account.
- **Centralized error handling**: every error carries an HTTP status and a JSON message; unexpected/internal errors are logged server-side but never leak their details to the client.

## Tech stack

| Category            | Choice                                                                                                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Runtime / framework | Node.js, Express 5 (routing, middleware)                                                                                                                                                                                             |
| Database / ODM      | MongoDB, Mongoose                                                                                                                                                                                                                    |
| Validation          | [Joi](https://joi.dev/) (schema validation, all routes)                                                                                                                                                                              |
| Auth                | JWT access tokens (`jsonwebtoken`) + rotating refresh token in an `httpOnly` cookie (`cookie-parser`), [bcryptjs](https://github.com/dcodeIO/bcrypt.js) for password hashing, `uid2` for refresh/confirmation/reset token generation |
| File upload         | [express-fileupload](https://github.com/richardgirges/express-fileupload) + [Cloudinary](https://cloudinary.com/) for image hosting                                                                                                  |
| API docs            | [swagger-jsdoc](https://github.com/Surnet/swagger-jsdoc) + [swagger-ui-express](https://github.com/scottie1984/swagger-ui-express) (OpenAPI 3.0, generated from JSDoc comments in the route files)                                   |
| Tooling             | ESLint + Prettier, GitHub Actions CI (lint, format check, tests with coverage, and a non-blocking `npm audit` on every push/PR)                                                                                                      |

_(Utility packages like `cors` and `dotenv` are used for standard config/CORS handling and aren't listed as architectural choices.)_

## API reference

Base URL: `http://localhost:3000` (or your configured `PORT`). All request/response bodies are JSON, except `publish`/`PUT`/`PATCH` which expect `multipart/form-data` (required for file upload, even on requests that only send text fields).

Authenticated routes expect an `Authorization: Bearer <accessToken>` header, using the access token returned by signup/login/refresh. The access token is short-lived (15 minutes); when it expires, call `POST /users/refresh` (no body - it reads the `refreshToken` httpOnly cookie set by signup/login/refresh) to get a new one without asking the user to log in again.

Interactive, explorable docs generated from these same routes are served at `/api-docs/` (raw OpenAPI document at `/api-docs.json`) - requesting `/api-docs` without the trailing slash redirects there.

| Method | Route                           | Auth            | Description                                                                                                                                                                                                                                                                                |
| ------ | ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| POST   | `/users/signup`                 | —               | Create an account. Body: `email`, `password` (min 6 chars), `username`, `newsletter` (optional). The account starts inactive; login is blocked until the emailed confirmation link is followed.                                                                                            |
| POST   | `/users/login`                  | —               | Log in. Body: `email`, `password`. Returns `403` if the account hasn't been confirmed yet.                                                                                                                                                                                                 |
| POST   | `/users/refresh`                | —               | No body - reads the `refreshToken` cookie and returns a new `accessToken`. The cookie is rotated only once it has aged past the rotation threshold, so the same value often comes back. `401` if the cookie is missing, unknown, expired, or already rotated out.                          |
| POST   | `/users/logout`                 | —               | No body - reads the `refreshToken` cookie if present and invalidates it, then clears the cookie. Always responds `200`, even with no cookie at all.                                                                                                                                        |
| GET    | `/users/confirm/:token`         | —               | Confirm an account from the link sent by signup/resend. Activates the account and, if `newsletter` was `true` at signup, sends a newsletter welcome email. `400` if the token is invalid or expired.                                                                                       |
| POST   | `/users/confirm/resend`         | —               | Body: `email`. Re-sends a confirmation email for an existing, not-yet-active account. Always responds `200` with the same message regardless of whether the email is unknown, already active, or genuinely re-sent — this endpoint never reveals account existence or confirmation status. |
| POST   | `/users/reset/request`          | —               | Body: `email`. Sends a password reset code to a known account's email. Always responds `200` with the same message regardless of whether the email is known - this endpoint never reveals account existence.                                                                               |
| POST   | `/users/reset/confirm`          | —               | Body: `token`, `password` (min 6 chars). Sets a new password from a reset code sent by `reset/request`, and invalidates the account's refresh session (a still-live access token simply expires on its own within 15 minutes). `400` if the token is invalid or expired.                   |
| GET    | `/users/:id`                    | —               | Get a user's public profile (`_id`, `account.username`, `account.avatar`, `newsletter`).                                                                                                                                                                                                   |
| PUT    | `/users/:id`                    | ✅ (self only)  | Replace a user's profile. `multipart/form-data`: `username` (required), optional `avatar` file and `newsletter` — omitting `avatar` leaves it unchanged, it's never cleared implicitly.                                                                                                    |
| PATCH  | `/users/:id`                    | ✅ (self only)  | Partially update a user's profile — send only `username`, `avatar` and/or `newsletter`.                                                                                                                                                                                                    |
| DELETE | `/users/:id`                    | ✅ (self only)  | Delete a user's own account, cascading to all of their offers (and Cloudinary images).                                                                                                                                                                                                     |
| POST   | `/offers/publish`               | ✅              | Publish a new offer. `multipart/form-data`: `title`, `description`, `price`, `brand`, `size`, `color`, `condition`, `city`, a required `picture` file, and up to 5 optional `pictures` files.                                                                                              |
| GET    | `/offers`                       | —               | List offers. Query params: `title`, `priceMin`, `priceMax`, `sort` (`price-asc` \| `price-desc`, default ascending), `page` (default 1, 20 per page).                                                                                                                                      |
| GET    | `/offers/:id`                   | —               | Get a single offer.                                                                                                                                                                                                                                                                        |
| PUT    | `/offers/:id`                   | ✅ (owner only) | Replace an offer. Same body as `publish` — the full set of fields is required, `picture` included; omitting `pictures` clears the secondary images.                                                                                                                                        |
| PATCH  | `/offers/:id`                   | ✅ (owner only) | Partially update an offer — send only the fields that change. `pictures`, if sent, replaces the whole secondary-image set; `picture` and `pictures` are independent of one another.                                                                                                        |
| DELETE | `/offers/:id`                   | ✅ (owner only) | Delete an offer and all its Cloudinary images.                                                                                                                                                                                                                                             |
| GET    | `/users/:id/favorites`          | ✅ (self only)  | List the user's favorited offers.                                                                                                                                                                                                                                                          |
| POST   | `/users/:id/favorites/:offerId` | ✅ (self only)  | Add an offer to the user's favorites. Idempotent - favoriting an already-favorited offer is a no-op. `400` past 500 favorites.                                                                                                                                                             |
| DELETE | `/users/:id/favorites/:offerId` | ✅ (self only)  | Remove an offer from the user's favorites. Idempotent - removing a non-favorited offer is a no-op.                                                                                                                                                                                         |

### Examples

Signup:

```bash
curl -i -X POST http://localhost:3000/users/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"jane@example.com","password":"secret123","username":"jane"}'
```

```
Set-Cookie: refreshToken=h8g7f6e5d4c3b2a1...; Path=/users; HttpOnly; SameSite=Lax
```

```json
{
    "_id": "66f1a2b3c4d5e6f7a8b9c0d1",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "account": { "username": "jane" }
}
```

Get a new access token once it expires (no body - the refresh token travels only in the cookie set above):

```bash
curl -X POST http://localhost:3000/users/refresh \
  -H "Cookie: refreshToken=h8g7f6e5d4c3b2a1..."
```

Publish an offer (owner-only, `multipart/form-data`; `pictures` can be repeated up to 5 times for secondary images):

```bash
curl -X POST http://localhost:3000/offers/publish \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
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
npm run dev
```

The server connects to MongoDB and Cloudinary on startup and refuses to start if the database connection fails.

`npm run dev` runs the server with `nodemon` (auto-restart on file changes) for local development; `npm start` runs it with plain `node` and is what a deployment platform (Render, Railway, etc.) should use as its start command.

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
| `JWT_SECRET`            | Secret used to sign/verify access tokens - keep this secret, never commit it.                                                                                                       |
| `PORT`                  | Optional, defaults to `3000`.                                                                                                                                                       |

`.env` is git-ignored; `.env.example` documents the variable names. If you ever deploy this API (Render, Railway, etc.), set these same variables in that platform's environment/secrets settings — there's nothing framework-specific to prefix them with here, since this is a plain Node/Express backend using `dotenv` (unlike a Vite or Create React App frontend, which requires a `VITE_`/`REACT_APP_` prefix for a variable to be exposed to the browser).

## Security

- Passwords are hashed with **bcrypt** (10 salt rounds) — never stored or returned in plain text.
- Authentication uses a short-lived (15 minute) JWT access token verified on every request to a protected route via the `isAuthenticated` middleware, plus a rotating refresh token delivered only in an `httpOnly` cookie (never in a JSON body). `POST /users/refresh` rotates that token only once it has aged past a 24-hour threshold, and a token that really was rotated out stops working immediately. The client refreshes on every page load, so rotating on each call would cost a database write per load and make two tabs opened at the same time race for the cookie, leaving the loser logged out until a reload.
- The flip side of that threshold is that inside the window the same refresh token is accepted more than once, so replaying a stolen cookie there no longer knocks the legitimate holder offline. That is the accepted cost of the trade, not an oversight: `POST /users/logout` and a password reset still cut the session immediately, and only one refresh token is ever active per account.
- The session is sliding: every visit extends it by another 30 days, with no absolute lifetime cap, so someone who comes back regularly is never logged out. That is a deliberate product decision for a marketplace rather than a consequence of where the client calls `POST /users/refresh`.
- Ownership is enforced server-side, atomically with the write itself (a single `findOneAndUpdate`/`findOneAndDelete` filtered by `{ _id, owner }`): an offer that exists but belongs to someone else returns `404`, the same as a non-existent one, so a non-owner can't distinguish the two. User account routes (`PUT`/`PATCH`/`DELETE /users/:id`) use `403` instead for the same mismatch — `GET /users/:id` is already public, so hiding an account's existence wouldn't add anything there.
- Joi validates and sanitizes input on every route before it reaches the database.
- The title search endpoint escapes regex special characters before building the search pattern, closing a ReDoS vector (an unescaped user-supplied string used directly as a regex source can trigger catastrophic backtracking).
- The global error handler returns a generic `Internal server error` message for unexpected errors and logs the real error server-side only — it never leaks stack traces or internals to the client.
- Cloudinary response fields that could be sensitive (like `api_key`) are deliberately excluded from the stored image schema.
- `helmet()` sets standard security headers and `x-powered-by` is disabled.
- `express.json()` is capped at 10kb and uploaded files at 5MB each; `cors()` is restricted to `FRONTEND_URL`.
- `/users/signup`, `/users/login`, `/users/refresh`, and `/users/logout` are rate limited (20 attempts per 15 minutes per IP).
- New accounts must confirm their email address before `login` or any authenticated route accepts their token — `login` only checks confirmation status after the password is verified, so a wrong password never reveals whether an account is confirmed. `POST /users/confirm/resend` responds identically whether the email is unknown, already active, or genuinely resent, so it can't be used to enumerate accounts either.
- Accounts lock out for 15 minutes after 5 consecutive failed login attempts (`423 Locked`), on top of the per-IP rate limiting above; a successful login resets the counter.
- Uploaded files (offer pictures, avatar) are validated against an allow-list of image MIME types (`image/jpeg`, `image/png`, `image/webp`) before being sent to Cloudinary — a disallowed type is rejected with `400` and never reaches Cloudinary's API.
- The refresh cookie is set with `SameSite=Lax`, which browsers won't send on a cross-site `fetch`/`XHR` (only on top-level navigations). This is transparent when frontend and backend share a site/subdomain, but if they're ever deployed on two different domains (e.g. a Vercel frontend calling a Render API), `POST /users/refresh` would silently stop receiving the cookie. Not yet verified against a real separate-domain deployment — worth a dedicated test before demoing that setup.

## Known limitations / roadmap

- **Test coverage is partial**: a Jest/Supertest suite covers the `user` and `offers` routes — signup/login, ownership checks, filtering, validation errors, the multi-image `pictures` field, PUT/PATCH/DELETE cleanup — using an isolated in-memory MongoDB instance (`mongodb-memory-server`), no shared test database involved. Cloudinary itself is mocked (`utils/cloudinary.js`), so the real network calls to Cloudinary's API aren't exercised.
- **Partial indexing**: `price` now has an index (added to speed up sorting and range filtering as the dataset grows). `name` doesn't — the title search uses an unanchored, case-insensitive regex (`new RegExp(escapeRegex(title), 'i')`), which a standard index can't accelerate. A proper fix would be a MongoDB [text index](https://www.mongodb.com/docs/manual/core/indexes/index-types/index-text/) with the `$text` operator, or a dedicated search engine (Atlas Search) — a real implementation change, not just an index to add.

## Project history

121 commits, visible in the commit history: an initial build in March 2026 (core API, Joi/manual validation, Cloudinary upload, ownership checks), and a dedicated hardening pass starting September 2026 (bcrypt migration, ReDoS fix, a real bug in the global error middleware found and fixed, ESLint/Prettier, CI, `.env.example`, JWT access/refresh tokens, favorites, and a run of scoped `security/*` feature branches - helmet, rate limiting, payload limits, CORS restriction, MIME validation, token expiry, account lockout, Mongo operator sanitization, Dependabot - each merged explicitly). Commit messages are descriptive and each change is scoped narrowly.

## Related project

[vinted-frontend](https://github.com/dan0203/vinted-frontend) is a React client originally built against this API's `/users/*`/`/offers/*` routes — note that its checkout step calls Le Réacteur's shared payment endpoint directly rather than this backend, so the payment flow isn't self-contained end-to-end. The `offers` response shape was renamed since (see [API reference](#api-reference)); the frontend hasn't been updated to match yet.

## License

[MIT](./LICENSE)

---

Built by [Dan Zerbib](https://github.com/dan0203) — [portfolio](https://dan0203.github.io)

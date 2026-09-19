# Vinted Backend - Project Overview

<!-- blueprint:source-hash 7a185bc2337095dcedaa787c9a9b12b0598cfe36f509c94d21f0eb5c466dd3a8 -->

> A RESTful backend API for a Vinted-inspired second-hand clothing marketplace:
> token-based authentication, listing (offer) management with image upload, and
> search/filter with pagination.

## Problem

Provide a working backend clone of Vinted's core: account creation, listing
(offer) publication with image upload, and a searchable/filterable catalog -
built during a full-stack bootcamp and later hardened (bcrypt, ReDoS fix,
CI/linting). It's a learning/portfolio project today, not a production
service; a live demo is planned once the companion frontend is connected.

## Users

- **Marketplace end users** (buyers and sellers of second-hand clothing) - via
  the companion `vinted-frontend` React client, once connected
- **Technical recruiters/reviewers** - reading the code as a portfolio piece

## Usage model

- Internet-facing once deployed; currently run locally only
- Untrusted, unauthenticated public access for read/signup endpoints
- Authenticated self/owner-only access for all mutations
- No compliance or audit requirements established
- Signup/login already rate limited (20 attempts / 15 min / IP)
- Password reset (feature 11) ships with the same ownership/expiry rigor as the
  existing auth code
- The refresh-cookie path (feature 13, shipped) is an untrusted input surface
  held to that same rigor: rotation, reuse detection, and expiry
- Feature 15 (shipped) made that rotation conditional on token age, so the
  session slides on a returning visit instead of rotating on every page load
- Feature 16 adds a public `owner` filter to the offer listing, which surfaces
  only what `GET /offers` already exposes publicly

## Features

Shipped:

1. **Signup / login** - bcrypt-hashed passwords, access token issued on success
2. **Account management** - update (PUT/PATCH) own username/avatar/newsletter, self-delete cascading to owned offers
3. **Offer publishing** - main picture + up to 5 secondary pictures via Cloudinary
4. **Offer management** - replace (PUT), partial update (PATCH), delete, owner-only, cascading Cloudinary cleanup
5. **Search & filtering** - title (ReDoS-safe), price range, sort by price, pagination
6. **Centralized error handling** - status-coded JSON errors, no leaked internals
7. **Security hardening pass** - bcrypt migration, ReDoS fix, helmet, rate limiting, CI (lint + format + test)
8. **Newsletter follow-through** - acts on the `newsletter` flag via an account confirmation/active flow
9. **Offer status** - `available` / `reserved` / `sold`; `getAll` excludes sold by default
10. **Favorites / saved offers** - User<->Offer relation (embedded ObjectId array on User)
11. **Password reset via email** - time-limited reset token on User
12. **Swagger / OpenAPI documentation** - interactive API docs generated from the existing routes
13. **JWT short-lived + httpOnly refresh cookie** - replaced the opaque Bearer token auth
14. **Explicit MongoDB indexes** - `schema.index()` on the fields used by search/filter/sort
15. **Sliding session with a rotation threshold** - the refresh token rotates only once it has aged past a threshold

Planned next (headline: the only unchecked item on the plan):

16. **Owner filter on the offer listing** - add a public `owner` query parameter
    to `GET /offers` so a seller's listings can be shown without a second
    endpoint

## Data model

### User

- `email` (String, required, unique)
- `account.username` (String, required, trimmed)
- `account.avatar` (Image, optional) - shared `imageSchema`
- `newsletter` (Boolean)
- `hash` (String, required) - bcrypt password hash
- `refreshToken` / `refreshTokenExpiresAt` (String/Date, default null) -
  feature 13; opaque value generated with `uid2`, backing `POST
  /users/refresh`/`POST /users/logout`. The short-lived JWT access token
  itself is not persisted - it's verified statelessly via its own signature
  and `exp` claim.
- `failedLoginAttempts` (Number, required, default 0)
- `lockUntil` (Date, default null)
- `active` (Boolean, required, default false) + `confirmationToken` /
  `confirmationTokenExpiresAt` (String/Date, default null) - feature 8
- `resetToken` / `resetTokenExpiresAt` (String/Date, default null) - feature 11
- `favorites` (ObjectId[] ref `Offer`, default []) - feature 10
- has many `Offer` (via `Offer.owner`)

> Feature 15 changed when `refreshToken` / `refreshTokenExpiresAt` are rewritten,
> not their shape. No schema change.

### Offer

- `_id` (ObjectId) - generated explicitly upfront so it can seed the
  Cloudinary storage path before the document saves
- `name` (String, required, trimmed)
- `description` (String, required, trimmed)
- `price` (Number, required, min 0) - indexed for sort/range filtering
- `details.brand` / `.size` / `.color` / `.condition` / `.city` (String, optional)
- `pictures` (Image[], default []) - up to 5 secondary images
- `owner` (ObjectId, ref User, required)
- `image` (Image, default {}) - main picture
- `status` (String enum: `available` / `reserved` / `sold`, default `available`) -
  feature 9; `GET /offers` filters out `sold` by default
- `createdAt` (Date, default now)

> `price` has an explicit index (`offerSchema.index({ price: 1 })`) for the
> default sort. Feature 14 extended explicit indexing to the other
> search/filter fields, and feature 16 adds `owner` to the fields the listing
> filters on.

### Image (shared `imageSchema`)

- Cloudinary metadata only (e.g. `secure_url`) - sensitive fields like
  `api_key` are deliberately excluded before storage

## Tech stack

- **Node.js / Express 5** - runtime and routing/middleware
- **MongoDB / Mongoose** - database and ODM
- **Joi** - schema validation on every route
- **jsonwebtoken + cookie-parser** - short-lived JWT access tokens and the
  `httpOnly` refresh cookie (feature 13)
- **bcryptjs + uid2** - password hashing and random token generation (refresh,
  confirmation, reset)
- **express-fileupload + Cloudinary** - multipart parsing and image hosting
- **ESLint + Prettier** - lint/format, enforced in CI
- **Jest + Supertest + mongodb-memory-server** - isolated test suite, no shared test DB
- **GitHub Actions CI** - lint, format:check, and test on every push/PR

## Monetization

Not applicable - portfolio/learning project, no monetization planned.

## UI/UX

Not applicable to this repository - API only. UI/UX lives in the separate
`vinted-frontend` client (not yet connected).

## Deployment

> TODO - no target chosen yet. Deliberately deferred until `vinted-frontend` is
> built and connected, so backend and frontend deploy together rather than the
> API shipping alone first. Render or Railway are candidates; revisit with
> `/release` at that point.

> The current MongoDB database and Cloudinary account hold only dev/test data
> (no real users or listings). Both will be wiped before the first live
> release, so no migration or backward-compatibility handling is needed for
> data created before that point - a schema change (e.g. a new field with a
> Mongoose default) does not need a test proving old documents still work.


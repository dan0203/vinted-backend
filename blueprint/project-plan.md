# Project Plan

## 1. Problem - What problem are we solving?

A RESTful backend API for a Vinted-inspired second-hand clothing marketplace:
account creation, listing (offer) publication with image upload, and
search/filter with pagination. Originally built during a full-stack bootcamp at
Le Réacteur (2026) as a clone of Vinted's core backend, then revisited for a
dedicated hardening pass (bcrypt password hashing, ReDoS fix, CI/linting).

Currently a learning/portfolio project, not a production service. A live demo
is planned once the companion `vinted-frontend` is built and connected to this
API - see [Deployment](#8-deployment---where-and-how-will-this-ship).

## 2. Users - Who is this for?

End users of the marketplace (buyers and sellers of second-hand clothing) via
the companion [vinted-frontend](https://github.com/dan0203/vinted-frontend)
React client. Secondarily, technical recruiters/reviewers reading the code as a
portfolio piece.

## 3. Features - What does the MVP need?

Already shipped (see build plan for the checked list):

- Signup/login with bcrypt-hashed passwords and token-based auth
- Authorization: only the offer owner or the account itself can update/delete it
- Offer publishing with a main picture plus up to 5 secondary pictures (Cloudinary)
- Offer replace (PUT) / partial update (PATCH) / delete, cascading Cloudinary cleanup
- Account update (username/avatar/newsletter) and self-delete (cascades to owned offers)
- Search/filter by title (ReDoS-safe), price range, sort by price, with pagination
- Centralized error handling (status-coded JSON errors, no leaked internals)
- Newsletter field follow-through (act on the previously unused `newsletter` flag)
- Offer status (available / reserved / sold)
- Favorites / saved offers
- Password reset via email
- Swagger / OpenAPI documentation
- JWT short-lived + httpOnly refresh cookie (replaced the opaque Bearer token auth)
- Explicit MongoDB indexes on search/filter/sort fields
- Sliding session with a rotation threshold (the refresh token rotates only once
  it has aged past a threshold, so a bootstrap `POST /users/refresh` on every
  page load no longer costs a write and a new cookie value)

Planned next (unchecked in build plan):

- Owner filter on the offer listing: a public `owner` query parameter on
  `GET /offers`, so a seller's listings can be shown without a second endpoint

## 4. Data - What are we storing?

- **User**: email, account (username, avatar), newsletter flag, password hash,
  refresh token + expiry, failed login attempts, lock-until timestamp,
  active/confirmation token (+ expiry), password-reset token (+ expiry),
  favorites (ObjectId[] ref Offer)
- **Offer**: name, description, price, details (brand, size, color, condition,
  city), main picture + up to 5 secondary pictures, owner ref, `status` enum
  (available / reserved / sold, default available), createdAt
- Images are stored on Cloudinary; only their Cloudinary metadata (via a shared
  `imageSchema`) is persisted in MongoDB
- An index already exists on `Offer.price` (used by the default sort)

Feature 13 shipped the refresh token as two fields on User rather than a
separate collection: `refreshToken` (opaque `uid2` value) and
`refreshTokenExpiresAt`. One active refresh token per user, not a per-device
session list. The short-lived JWT access token is not persisted; it is verified
statelessly from its own signature and `exp` claim.

No schema change is anticipated for feature 15, which only changes how often
those two fields are rewritten.

## 5. Tech - What stack are we using?

| Category            | Choice                                                                |
| ------------------- | --------------------------------------------------------------------- |
| Runtime / framework | Node.js, Express 5                                                    |
| Database / ODM      | MongoDB, Mongoose                                                     |
| Validation          | Joi (all routes)                                                      |
| Auth                | jsonwebtoken + cookie-parser (refresh cookie), bcryptjs, uid2         |
| File upload         | express-fileupload + Cloudinary                                       |
| Tooling             | ESLint + Prettier, GitHub Actions CI (lint + format + test)           |
| Testing             | Jest + Supertest, mongodb-memory-server (isolated, no shared test DB) |

## 6. Monetize - How will this make money?

Not applicable - portfolio/learning project, no monetization planned.

## 7. UI/UX - How should this look and feel?

Not applicable to this repository - this is the backend API only. UI/UX lives
in the separate `vinted-frontend` client.

## 8. Deployment - Where and how will this ship?

No demo is currently deployed, and deployment is deliberately deferred: it
ships once `vinted-frontend` is built and connected to this API, so backend and
frontend go live together rather than deploying the API alone first. Render or
Railway were mentioned as candidates. Revisit with `/release` when that
milestone is reached.

The current MongoDB database and Cloudinary account hold only dev/test data (no
real users or listings). Both will be wiped before the first live release, so no
migration or backward-compatibility handling is needed for data created before
that point: a schema change (e.g. a new field with a Mongoose default) does not
need a test proving old documents still work.

## 9. Usage model and constraints (optional)

Internet-facing once deployed, but currently run locally only. Untrusted,
unauthenticated public users for read/signup endpoints; authenticated
self/owner-only access for mutations. No compliance or audit requirements
established. Rate limiting already applied to signup/login (20 attempts / 15
min / IP). Any password-reset-by-email addition introduces a new untrusted
input surface (email delivery, token guessing) that should get the same
ownership/expiry rigor as existing auth code.

# Build Plan

List the features that make up your project, high level and in rough build order.
Keep each item to one line; the details come later in `/feature`.

Plain bullets are fine. When both planning docs are ready, run `/overview`.
It adds tracking numbers and checkboxes to your feature list before generating
the project overview.

Run `/feature` to spec the next unchecked item, or `/feature 2` to pick one.
Keep completed items checked and append new features as the project grows.
Do not renumber completed features; their archived specs refer to those IDs.

Scaffolding the app and prototyping its look are pre-build steps, not features.
Start with your first real slice of functionality.

## Your features

Shipped (reflects the current codebase):

- [x] 1. **Signup / login** - bcrypt password hashing, Bearer token issued on success
- [x] 2. **Account management** - update (PUT/PATCH) own username/avatar/newsletter, self-delete cascading to owned offers
- [x] 3. **Offer publishing** - main picture + up to 5 secondary pictures via Cloudinary
- [x] 4. **Offer management** - replace (PUT), partial update (PATCH), delete, owner-only, cascading Cloudinary cleanup
- [x] 5. **Search & filtering** - title (ReDoS-safe), price range, sort by price, pagination
- [x] 6. **Centralized error handling** - status-coded JSON errors, no leaked internals
- [x] 7. **Security hardening pass** - bcrypt migration, ReDoS fix, helmet, rate limiting, CI (lint + format + test)
- [x] 8. **Newsletter follow-through** - the `newsletter` field is collected at signup and stored but never acted on; either document it explicitly as reserved for a future feature or implement a real send (e.g. a conditional welcome email via Nodemailer)
- [x] 9. **Offer status** - add `available` / `reserved` / `sold` to the Offer schema; `getAll` should filter out sold offers by default
- [x] 10. **Favorites / saved offers** - let a user save offers (User<->Offer relation, shape decided in `/feature`: embedded ObjectId array vs. separate Favorite collection)
- [x] 11. **Password reset via email** - email-delivered, time-limited reset token; currently there is no account-recovery path at all

Planned next:

- [x] 12. **Swagger / OpenAPI documentation** - generate interactive API docs from the existing routes so reviewers can explore the API without reading the code
- [x] 13. **JWT short-lived + httpOnly refresh cookie** - replace the current opaque Bearer token auth with a short-lived JWT plus a refresh token delivered in an httpOnly cookie
- [x] 14. **Explicit MongoDB indexes** - add `schema.index()` declarations for the fields actually used in search/filter/sort
- [x] 15. **Sliding session with a rotation threshold** - rotate the refresh token only once it has aged past a threshold, so a bootstrap `POST /users/refresh` on every page load keeps the session alive without a database write and a new cookie value each time
- [x] 16. **Owner filter on the offer listing** - add a public `owner` query parameter to `GET /offers` so a seller's listings can be shown without a second endpoint

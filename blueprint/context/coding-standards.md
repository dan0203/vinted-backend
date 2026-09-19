# Coding Standards

> Your conventions, tuned to this project's actual stack (Node.js/Express 5,
> MongoDB/Mongoose, Joi) by `/adopt`.

## Runtime & framework

- Node.js, Express 5 (routing, middleware), CommonJS modules (`require`/`module.exports`)
- Layered architecture: `routes/` (wiring + middleware) -> `controllers/`
  (request/response, thin) -> `services/` (business logic) -> `models/`
  (Mongoose schemas)
- Centralized error handling: throw via `utils/throwError.js` with an HTTP
  status; the global error handler in `app.js` converts it to a JSON `{
  message }` response and never leaks internals for unexpected errors

## Package manager

- npm, with `package-lock.json` committed

## Project structure

- `routes/*.route.js` - Express routers, mounted in `app.js`
- `controllers/*.controller.js` - request handling, delegates to services
- `services/*.service.js` - business logic and database operations
- `models/*.js` - Mongoose schemas (`imageSchema.js` is shared by User/Offer)
- `middlewares/` - `isAuthenticated`, `authLimiter`, `sanitizeMongo`
- `utils/` - small single-purpose helpers (validation, Cloudinary, regex
  escaping, error throwing)
- `tests/` - Jest/Supertest suites, one file per route group, plus
  `setupTestDb.js` for the in-memory MongoDB instance
- `data/` - seed/dummy data for local development, not used in tests

## Validation

- Joi schemas validate and sanitize input on every route before it reaches the
  database
- `sanitizeMongo` middleware strips Mongo operator injection from request data
  before it reaches Joi/Mongoose

## Auth & ownership

- Custom Bearer-token auth (`isAuthenticated` middleware), opaque token
  generated with `uid2`, checked against the database per request
- Enforce ownership atomically with the write itself (single
  `findOneAndUpdate`/`findOneAndDelete` filtered by `{ _id, owner }`), not as a
  separate read-then-check
- Offer ownership mismatches return `404` (indistinguishable from
  non-existent); user account ownership mismatches return `403` (the account's
  existence is already public via `GET /users/:id`)

## File upload / images

- `express-fileupload` for multipart parsing, Cloudinary for storage
- Cloudinary response fields that could be sensitive (e.g. `api_key`) are
  excluded from the stored image schema
- Delete the corresponding Cloudinary assets whenever the owning offer/user is
  deleted or an image field is replaced

## Error handling

- Business/validation errors: throw through `utils/throwError.js` with an
  explicit HTTP status and a client-safe message
- Unexpected errors: let them reach the global handler, which logs
  server-side and returns a generic `500 Internal server error` - never leak
  stack traces or internals to the client

## Testing

Testing is already set up in this project: Jest + Supertest, run via `npm
test`, with `mongodb-memory-server` providing an isolated in-memory MongoDB
instance (no shared test database). Cloudinary is mocked (`utils/cloudinary.js`)
rather than hitting the real API. **Tests are a gate**: `npm test` (declared as
`test` in `AGENTS.md`) must be green before a step is approved, before any
checkpoint commit, and before `/complete` merges.

- **What to test:** route behavior end-to-end via Supertest (status codes,
  response shape, validation errors), ownership checks, and pure logic helpers
  in `utils/` (regex escaping, id assertions, etc.)
- **What not to test:** the real Cloudinary network calls (mocked instead) or
  anything requiring a real browser - this is an API-only project
- Test files live in `tests/`, one file per route group
  (`<group>.test.js`), plus `validation.test.js` for Joi schema behavior
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed"
- Run tests via `npm test` (or `npm run test:watch` locally), not a hardcoded
  Jest invocation

## Browser Verification

Not applicable - this is an API-only backend with no UI. Verify behavior via
`npm test` and, when useful, manual `curl`/HTTP client requests against the
running server (see the README's API reference for examples).

## Code Quality

- ESLint (`npm run lint`) + Prettier (`npm run format:check`) must pass; both
  run in CI on every push/PR alongside `npm test`
- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible
- Prettier config: single quotes, 4-space indent, semicolons, ES5 trailing commas

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.

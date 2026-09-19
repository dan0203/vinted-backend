const MIN_PRICE = 0;
const MIN_PRICEMIN = 0;
const MIN_PRICEMAX = 0;
const MIN_PAGE = 1;
const OFFERS_PER_PAGE = 20;
const MAX_PICTURES = 5;
const MAX_FAVORITES = 500;
const FIELD_SORT_OPTIONS = ['price-asc', 'price-desc'];
const OFFER = 'offer';
const USER = 'user';
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// The client calls POST /users/refresh on every page load, so rotating on each
// call would cost a write and a new cookie value per load, and would make two
// tabs opened together race for the cookie. A refresh token is instead rotated
// only once this much of its life has elapsed: far below the 30-day TTL, so the
// session still slides long before it could lapse, and far above a page-load
// burst, so concurrent tabs converge on one cookie.
const REFRESH_ROTATION_THRESHOLD_MS = 24 * 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const ACCOUNT_LOCK_MS = 15 * 60 * 1000;
const CONFIRMATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

module.exports = {
    MIN_PRICE,
    MIN_PRICEMIN,
    MIN_PRICEMAX,
    MIN_PAGE,
    OFFERS_PER_PAGE,
    MAX_PICTURES,
    MAX_FAVORITES,
    FIELD_SORT_OPTIONS,
    OFFER,
    USER,
    ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_MS,
    REFRESH_ROTATION_THRESHOLD_MS,
    MAX_LOGIN_ATTEMPTS,
    ACCOUNT_LOCK_MS,
    CONFIRMATION_TOKEN_TTL_MS,
    RESET_TOKEN_TTL_MS,
};

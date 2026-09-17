const { Resend } = require('resend');

// Constructed lazily inside each function (not at module load) so a missing
// RESEND_API_KEY - the constructor throws on a falsy key - is caught and
// swallowed like any other send failure, instead of crashing the app at startup.
async function sendConfirmationEmail(to, token) {
    if (!process.env.BACKEND_URL || !process.env.EMAIL_FROM) {
        console.error(
            'Failed sending confirmation email: BACKEND_URL or EMAIL_FROM is not configured'
        );
        return;
    }

    const confirmUrl = `${process.env.BACKEND_URL}/users/confirm/${token}`;

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to,
            subject: 'Confirm your Vinted account',
            html: `<p>Click the link below to confirm your email address:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p>`,
        });
    } catch (error) {
        console.error(`Failed sending confirmation email: ${error.message}`);
    }
}

async function sendNewsletterWelcomeEmail(to) {
    if (!process.env.EMAIL_FROM) {
        console.error(
            'Failed sending newsletter welcome email: EMAIL_FROM is not configured'
        );
        return;
    }

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to,
            subject: 'Welcome to the Vinted newsletter',
            html: '<p>Thanks for subscribing to the newsletter!</p>',
        });
    } catch (error) {
        console.error(
            `Failed sending newsletter welcome email: ${error.message}`
        );
    }
}

// No clickable link here (unlike sendConfirmationEmail): confirming a reset
// requires POSTing a new password alongside the token, which a mail client
// can't do on its own, so the raw token is what the caller's client needs.
async function sendPasswordResetEmail(to, token) {
    if (!process.env.EMAIL_FROM) {
        console.error(
            'Failed sending password reset email: EMAIL_FROM is not configured'
        );
        return;
    }

    try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
            from: process.env.EMAIL_FROM,
            to,
            subject: 'Reset your Vinted password',
            html: `<p>Use the code below to reset your password. It expires in 1 hour.</p><p>${token}</p>`,
        });
    } catch (error) {
        console.error(`Failed sending password reset email: ${error.message}`);
    }
}

module.exports = {
    sendConfirmationEmail,
    sendNewsletterWelcomeEmail,
    sendPasswordResetEmail,
};

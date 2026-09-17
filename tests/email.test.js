const mockSend = jest.fn();

jest.mock('resend', () => ({
    Resend: jest.fn().mockImplementation(() => ({
        emails: { send: mockSend },
    })),
}));

const {
    sendConfirmationEmail,
    sendNewsletterWelcomeEmail,
} = require('../utils/email');

const originalBackendUrl = process.env.BACKEND_URL;
const originalEmailFrom = process.env.EMAIL_FROM;

beforeEach(() => {
    process.env.BACKEND_URL = 'https://api.example.com';
    process.env.EMAIL_FROM = 'noreply@example.com';
});

afterEach(() => {
    mockSend.mockReset();
    process.env.BACKEND_URL = originalBackendUrl;
    process.env.EMAIL_FROM = originalEmailFrom;
});

describe('utils/email', () => {
    it('swallows a rejected sendConfirmationEmail call instead of throwing', async () => {
        mockSend.mockRejectedValueOnce(new Error('Resend is down'));

        await expect(
            sendConfirmationEmail('jane@example.com', 'sometoken')
        ).resolves.toBeUndefined();
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('swallows a rejected sendNewsletterWelcomeEmail call instead of throwing', async () => {
        mockSend.mockRejectedValueOnce(new Error('Resend is down'));

        await expect(
            sendNewsletterWelcomeEmail('jane@example.com')
        ).resolves.toBeUndefined();
        expect(mockSend).toHaveBeenCalledTimes(1);
    });

    it('sends the confirmation email with the from address and confirmation link', async () => {
        mockSend.mockResolvedValueOnce({});

        await sendConfirmationEmail('jane@example.com', 'sometoken');

        expect(mockSend).toHaveBeenCalledWith(
            expect.objectContaining({
                from: 'noreply@example.com',
                to: 'jane@example.com',
                html: expect.stringContaining(
                    'https://api.example.com/users/confirm/sometoken'
                ),
            })
        );
    });

    it('skips sending when BACKEND_URL is not configured', async () => {
        delete process.env.BACKEND_URL;

        await sendConfirmationEmail('jane@example.com', 'sometoken');

        expect(mockSend).not.toHaveBeenCalled();
    });

    it('skips sending when EMAIL_FROM is not configured', async () => {
        delete process.env.EMAIL_FROM;

        await sendConfirmationEmail('jane@example.com', 'sometoken');
        await sendNewsletterWelcomeEmail('jane@example.com');

        expect(mockSend).not.toHaveBeenCalled();
    });
});

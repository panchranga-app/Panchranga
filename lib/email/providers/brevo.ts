import { EmailMessage, EmailProvider, EmailRecipient, SendResult } from '../types';

export class BrevoProvider implements EmailProvider {
  readonly name = 'brevo';

  isConfigured(): boolean {
    const isEnabled = process.env.BREVO_ENABLED === 'true' || process.env.BREVO_ENABLED === '1';
    return Boolean(isEnabled && process.env.BREVO_API_KEY && process.env.BREVO_SENDER_EMAIL);
  }

  async send(recipient: EmailRecipient, message: EmailMessage): Promise<SendResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: 'Brevo provider is not enabled or not configured', permanent: false };
    }

    try {
      const senderName = process.env.BREVO_SENDER_NAME || 'Panchranga';
      const senderEmail = process.env.BREVO_SENDER_EMAIL!;
      const apiKey = process.env.BREVO_API_KEY!;

      const payload: Record<string, any> = {
        sender: {
          name: senderName,
          email: senderEmail,
        },
        to: [{ email: recipient.email }],
        subject: message.subject,
        htmlContent: message.html,
      };

      if (message.text) {
        payload.textContent = message.text;
      }

      if (message.headers && Object.keys(message.headers).length > 0) {
        payload.headers = message.headers;
      }

      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'api-key': apiKey,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        return { ok: true };
      }

      const data = await res.json().catch(() => ({}));
      const errorMsg = data?.message || data?.error || `HTTP ${res.status} ${res.statusText}`;
      const errStr = `${errorMsg}`.toLowerCase();

      // Check daily quota / credits exhaustion
      const isQuota =
        res.status === 402 ||
        (res.status === 429 && (errStr.includes('quota') || errStr.includes('credit') || errStr.includes('limit'))) ||
        errStr.includes('quota exceeded') ||
        errStr.includes('insufficient credit');

      if (isQuota) {
        return {
          ok: false,
          error: errorMsg,
          quotaExceeded: true,
          permanent: false,
        };
      }

      // Check permanent errors (invalid email, blacklisted recipient)
      const isPermanent =
        res.status === 400 &&
        (errStr.includes('invalid') ||
          errStr.includes('blacklisted') ||
          errStr.includes('unsubscribed') ||
          errStr.includes('format'));

      return {
        ok: false,
        error: errorMsg,
        permanent: isPermanent,
        quotaExceeded: false,
      };
    } catch (err: any) {
      return {
        ok: false,
        error: err?.message || String(err),
        permanent: false,
        quotaExceeded: false,
      };
    }
  }
}

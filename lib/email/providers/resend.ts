import { Resend } from 'resend';
import { EmailMessage, EmailProvider, EmailRecipient, SendResult } from '../types';

export class ResendProvider implements EmailProvider {
  readonly name = 'resend';
  private resend: Resend | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.RESEND_API_KEY);
  }

  private getResend(): Resend {
    if (!this.resend) {
      if (!this.isConfigured()) {
        throw new Error('Resend API key not configured (RESEND_API_KEY missing)');
      }
      this.resend = new Resend(process.env.RESEND_API_KEY);
    }
    return this.resend;
  }

  async send(recipient: EmailRecipient, message: EmailMessage): Promise<SendResult> {
    try {
      const resend = this.getResend();
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Panchranga <onboarding@resend.dev>';

      const sendResult = await resend.emails.send({
        from: fromEmail,
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });

      if (sendResult.error) {
        const errorMsg = sendResult.error.message || JSON.stringify(sendResult.error);
        const errStr = errorMsg.toLowerCase();

        const isQuota =
          sendResult.error.name === 'rate_limit_exceeded' ||
          errStr.includes('quota') ||
          errStr.includes('limit exceeded') ||
          errStr.includes('daily limit');

        const isPermanent =
          sendResult.error.name === 'validation_error' ||
          errStr.includes('invalid') ||
          errStr.includes('domain') ||
          errStr.includes('restricted') ||
          errStr.includes('not verified');

        return {
          ok: false,
          error: errorMsg,
          quotaExceeded: isQuota,
          permanent: isPermanent,
        };
      }

      return { ok: true };
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      const errStr = errorMsg.toLowerCase();
      const isQuota = errStr.includes('quota') || errStr.includes('rate limit');
      const isPermanent = errStr.includes('invalid') || errStr.includes('validation');

      return {
        ok: false,
        error: errorMsg,
        quotaExceeded: isQuota,
        permanent: isPermanent,
      };
    }
  }
}

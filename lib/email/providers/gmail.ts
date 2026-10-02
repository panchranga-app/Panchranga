import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailMessage, EmailProvider, EmailRecipient, SendResult } from '../types';

export class GmailSmtpProvider implements EmailProvider {
  readonly name = 'gmail';
  private transporter: Transporter | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      if (!this.isConfigured()) {
        throw new Error('Gmail SMTP credentials not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)');
      }

      this.transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        pool: true,
        maxConnections: 3,
        maxMessages: 100,
        rateDelta: 1000,
        rateLimit: 5,
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      });
    }
    return this.transporter;
  }

  async send(recipient: EmailRecipient, message: EmailMessage): Promise<SendResult> {
    try {
      const transporter = this.getTransporter();
      const user = process.env.GMAIL_USER;
      const from = `Panchranga <${user}>`;

      await transporter.sendMail({
        from,
        to: recipient.email, // Send strictly ONE email per subscriber
        subject: message.subject,
        html: message.html,
        text: message.text,
        headers: message.headers,
      });

      return { ok: true };
    } catch (err: any) {
      const rawMessage = err?.message || String(err);
      const responseCode = err?.responseCode;
      const errStr = `${rawMessage} ${responseCode || ''}`.toLowerCase();

      // Check for daily quota exhaustion (e.g. Gmail 550 5.4.5 or 454 4.7.0)
      const isQuota =
        errStr.includes('5.4.5') ||
        errStr.includes('4.7.0') ||
        errStr.includes('daily user sending limit') ||
        errStr.includes('daily sending quota') ||
        errStr.includes('sending limit exceeded') ||
        errStr.includes('quota exceeded') ||
        (responseCode === 550 && errStr.includes('limit'));

      if (isQuota) {
        return {
          ok: false,
          error: rawMessage,
          quotaExceeded: true,
          permanent: false,
        };
      }

      // Check for permanent failures (SMTP 5xx error codes other than quota 550 5.4.5)
      // e.g. 550 5.1.1 User unknown, 551 User not local, 553 Invalid mailbox syntax
      const isPermanent =
        (typeof responseCode === 'number' && responseCode >= 500 && responseCode < 600) ||
        errStr.includes('5.1.1') ||
        errStr.includes('user unknown') ||
        errStr.includes('does not exist') ||
        errStr.includes('invalid recipient') ||
        errStr.includes('mailbox unavailable') ||
        errStr.includes('recipient address rejected');

      return {
        ok: false,
        error: rawMessage,
        permanent: isPermanent,
        quotaExceeded: false,
      };
    }
  }

  async close(): Promise<void> {
    if (this.transporter) {
      this.transporter.close();
      this.transporter = null;
    }
  }
}

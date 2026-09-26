import nodemailer, { type Transporter } from 'nodemailer';
import { env, hasSmtp, isTest } from '../../config/env.js';
import { logger } from '../../config/logger.js';

/**
 * Outbound email.
 *
 * When SMTP is not configured the message is logged instead of sent, including
 * the full verification or reset URL. That is deliberate: it keeps local
 * development and the graded demo working with zero mail-provider setup, and
 * the link is visible in the server log. Production configures real SMTP.
 */

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!hasSmtp) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    ...(env.SMTP_USER && env.SMTP_PASSWORD
      ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } }
      : {}),
  });
  return transporter;
}

export interface SendResult {
  delivered: boolean;
  /** 'smtp' when actually sent, 'console' when logged only. */
  channel: 'smtp' | 'console';
}

export async function sendMail(message: MailMessage): Promise<SendResult> {
  if (isTest) return { delivered: false, channel: 'console' };

  const transport = getTransporter();

  if (!transport) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      'EMAIL (not sent - SMTP not configured). The link below is live:',
    );
    return { delivered: false, channel: 'console' };
  }

  try {
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { delivered: true, channel: 'smtp' };
  } catch (error) {
    // A mail failure must not fail the request that triggered it: a user whose
    // verification email bounces can still resend, but a 500 on register would
    // lose the account entirely.
    logger.error({ err: error, to: message.to }, 'Failed to send email');
    return { delivered: false, channel: 'console' };
  }
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en"><body style="margin:0;background:#f5f6f8;font-family:Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:12px;padding:32px;">
        <tr><td>
          <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Stock Market Dashboard</p>
          <h1 style="margin:0 0 20px;font-size:20px;color:#111827;">${title}</h1>
          ${bodyHtml}
          <hr style="margin:28px 0 16px;border:none;border-top:1px solid #e5e7eb;" />
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            This is a simulated trading platform built for educational purposes.
            No real money or real brokerage accounts are involved.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<p style="margin:0 0 20px;">
    <a href="${url}" style="display:inline-block;background:#3b5bdb;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>
  </p>
  <p style="margin:0 0 4px;font-size:13px;color:#6b7280;">Or paste this link into your browser:</p>
  <p style="margin:0;font-size:12px;color:#3b5bdb;word-break:break-all;">${url}</p>`;
}

export function buildVerificationEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: 'Verify your email address',
    text: `Hi ${name},\n\nConfirm your email address to activate your Stock Market Dashboard account:\n${url}\n\nThis link expires in 24 hours.`,
    html: layout(
      'Verify your email address',
      `<p style="margin:0 0 20px;font-size:14px;color:#374151;">Hi ${name}, confirm your email address to activate your account.</p>
       ${button(url, 'Verify email')}
       <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This link expires in 24 hours.</p>`,
    ),
  };
}

export function buildPasswordResetEmail(to: string, name: string, url: string): MailMessage {
  return {
    to,
    subject: 'Reset your password',
    text: `Hi ${name},\n\nReset your Stock Market Dashboard password:\n${url}\n\nThis link expires in 1 hour. If you did not request it, ignore this email.`,
    html: layout(
      'Reset your password',
      `<p style="margin:0 0 20px;font-size:14px;color:#374151;">Hi ${name}, use the button below to choose a new password.</p>
       ${button(url, 'Reset password')}
       <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">This link expires in 1 hour. If you did not request a reset, you can safely ignore this email.</p>`,
    ),
  };
}

export function buildPasswordChangedEmail(to: string, name: string): MailMessage {
  return {
    to,
    subject: 'Your password was changed',
    text: `Hi ${name},\n\nYour Stock Market Dashboard password was just changed. If this was not you, reset it immediately.`,
    html: layout(
      'Your password was changed',
      `<p style="margin:0;font-size:14px;color:#374151;">Hi ${name}, your password was just changed. If this was not you, reset your password immediately and review your account.</p>`,
    ),
  };
}

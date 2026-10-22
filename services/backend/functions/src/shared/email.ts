export type TransactionalEmailKind =
  'welcome' | 'email-verification' | 'password-reset' | 'password-changed';

export interface TransactionalEmail {
  subject: string;
  text: string;
  html: string;
}

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

export function renderTransactionalEmail(
  kind: TransactionalEmailKind,
  input: { displayName?: string | null; actionUrl?: string },
): TransactionalEmail {
  const name = escapeHtml(input.displayName?.trim() || 'there');
  const actionUrl = input.actionUrl ? escapeHtml(input.actionUrl) : null;
  const copy = {
    welcome: {
      subject: 'Welcome to Tastes',
      heading: `Welcome, ${name}`,
      body: 'Your Tastes account is ready. Start discovering places, sharing reviews, and following people whose taste you trust.',
      action: null,
      actionLabel: null,
    },
    'email-verification': {
      subject: 'Verify your Tastes email',
      heading: 'Verify your email',
      body: 'Confirm this email address to keep your account secure and make account recovery easier.',
      action: actionUrl,
      actionLabel: 'Verify email',
    },
    'password-reset': {
      subject: 'Reset your Tastes password',
      heading: 'Reset your password',
      body: 'Use the secure link below to choose a new password. If you did not request this, you can ignore this email.',
      action: actionUrl,
      actionLabel: 'Reset password',
    },
    'password-changed': {
      subject: 'Your Tastes password was changed',
      heading: 'Password changed',
      body: 'Your password was changed successfully. If this was not you, reset your password immediately and contact support.',
      action: actionUrl,
      actionLabel: actionUrl ? 'Secure my account' : null,
    },
  }[kind];
  const actionMarkup =
    copy.action && copy.actionLabel
      ? `<a href="${copy.action}" style="display:inline-block;margin-top:24px;padding:13px 22px;border-radius:999px;background:#B82F29;color:#FFFFFF;text-decoration:none;font-weight:700">${copy.actionLabel}</a>`
      : '';
  const actionText =
    copy.action && copy.actionLabel
      ? `\n\n${copy.actionLabel}: ${input.actionUrl}`
      : '';

  return {
    subject: copy.subject,
    text: `${copy.heading}\n\n${copy.body}${actionText}\n\n— Tastes`,
    html: `<!doctype html><html><body style="margin:0;background:#080808;color:#FFFFFF;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#161616;border:1px solid #34363B;border-radius:24px"><tr><td style="padding:32px"><div style="color:#B82F29;font-size:24px;font-weight:800">tastes</div><h1 style="margin:28px 0 12px;font-size:28px;line-height:34px">${copy.heading}</h1><p style="margin:0;color:#AAB2C5;font-size:16px;line-height:24px">${copy.body}</p>${actionMarkup}<p style="margin:32px 0 0;color:#707582;font-size:12px">This automated message was sent by Tastes.</p></td></tr></table></td></tr></table></body></html>`,
  };
}

export async function sendTransactionalEmail(input: {
  apiKey: string;
  from: string;
  to: string;
  message: TransactionalEmail;
  eventId?: string;
}): Promise<void> {
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { email: input.from, name: 'Tastes' },
      personalizations: [
        {
          to: [{ email: input.to }],
          ...(input.eventId
            ? { custom_args: { event_id: input.eventId } }
            : {}),
        },
      ],
      subject: input.message.subject,
      content: [
        { type: 'text/plain', value: input.message.text },
        { type: 'text/html', value: input.message.html },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`SendGrid rejected email with status ${response.status}`);
  }
}

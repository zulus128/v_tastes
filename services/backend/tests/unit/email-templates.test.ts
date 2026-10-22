import { describe, expect, it } from 'vitest';
import { renderTransactionalEmail } from '../../functions/src/shared/email';

describe('transactional email templates', () => {
  it.each([
    'welcome',
    'email-verification',
    'password-reset',
    'password-changed',
  ] as const)('renders branded %s email', (kind) => {
    const result = renderTransactionalEmail(kind, {
      actionUrl: 'https://example.com/action?token=safe',
      displayName: '<Vadim>',
    });

    expect(result.subject).toBeTruthy();
    expect(result.html).toContain('#080808');
    expect(result.html).toContain('#B82F29');
    expect(result.html).not.toContain('<Vadim>');
    expect(result.text).toContain('Tastes');
  });
});

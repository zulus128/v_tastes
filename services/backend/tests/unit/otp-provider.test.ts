import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOtpProvider,
  TwilioVerifyOtpProvider,
} from '../../functions/src/modules/auth/otp-provider';

const config = {
  accountSid: 'AC_test',
  authToken: 'secret',
  serviceSid: 'VA_test',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('TwilioVerifyOtpProvider', () => {
  it('starts an SMS verification with authenticated form data', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ sid: 'VE123', status: 'pending' }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const provider = new TwilioVerifyOtpProvider(
      config,
      fetcher as typeof fetch,
    );

    await expect(provider.startVerification('+15551234567')).resolves.toEqual({
      providerReference: 'VE123',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://verify.twilio.com/v2/Services/VA_test/Verifications',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from('AC_test:secret').toString('base64')}`,
        }),
      }),
    );
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toBe('To=%2B15551234567&Channel=sms');
  });

  it('maps an approved verification check', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: 'approved' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const provider = new TwilioVerifyOtpProvider(
      config,
      fetcher as typeof fetch,
    );

    await expect(
      provider.checkVerification({
        phoneNumber: '+15551234567',
        code: '123456',
        providerReference: 'VE123',
      }),
    ).resolves.toBe('approved');
  });

  it('keeps the fake provider enabled in production until Twilio is activated', async () => {
    vi.stubEnv('FUNCTIONS_EMULATOR', 'false');
    vi.stubEnv('GCLOUD_PROJECT', 'tastes-934e6');
    const provider = createOtpProvider();

    await expect(provider.startVerification('+15551234567')).resolves.toEqual({
      providerReference: 'fake:+15551234567',
      localCode: '1332',
    });
  });
});

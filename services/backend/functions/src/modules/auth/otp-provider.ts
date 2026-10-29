export type OtpCheckStatus = 'approved' | 'pending';

export interface OtpStartResult {
  providerReference: string;
  localCode?: string;
}

export interface OtpProvider {
  startVerification(phoneNumber: string): Promise<OtpStartResult>;
  checkVerification(input: {
    phoneNumber: string;
    code: string;
    providerReference: string;
  }): Promise<OtpCheckStatus>;
}

export interface TwilioVerifyConfig {
  accountSid: string;
  authToken: string;
  serviceSid: string;
}

const LOCAL_OTP_CODE = '1332';

class FakeOtpProvider implements OtpProvider {
  async startVerification(phoneNumber: string): Promise<OtpStartResult> {
    return {
      providerReference: `fake:${phoneNumber}`,
      localCode: LOCAL_OTP_CODE,
    };
  }

  async checkVerification(input: {
    phoneNumber: string;
    code: string;
    providerReference: string;
  }): Promise<OtpCheckStatus> {
    const expectedReference = `fake:${input.phoneNumber}`;
    return input.providerReference === expectedReference &&
      input.code === LOCAL_OTP_CODE
      ? 'approved'
      : 'pending';
  }
}

export class TwilioVerifyOtpProvider implements OtpProvider {
  constructor(
    private readonly config: TwilioVerifyConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async post(
    path: string,
    body: URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetcher(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(this.config.serviceSid)}/${path}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      },
    );
    const payload = (await response.json()) as Record<string, unknown>;
    if (!response.ok) {
      const message =
        typeof payload.message === 'string'
          ? payload.message
          : 'Twilio Verify request failed.';
      throw new Error(message);
    }
    return payload;
  }

  async startVerification(phoneNumber: string): Promise<OtpStartResult> {
    const payload = await this.post(
      'Verifications',
      new URLSearchParams({ To: phoneNumber, Channel: 'sms' }),
    );
    if (typeof payload.sid !== 'string') {
      throw new Error('Twilio Verify did not return a verification SID.');
    }
    return { providerReference: payload.sid };
  }

  async checkVerification(input: {
    phoneNumber: string;
    code: string;
    providerReference: string;
  }): Promise<OtpCheckStatus> {
    const payload = await this.post(
      'VerificationCheck',
      new URLSearchParams({ To: input.phoneNumber, Code: input.code }),
    );
    return payload.status === 'approved' ? 'approved' : 'pending';
  }
}

export function createOtpProvider(): OtpProvider {
  return new FakeOtpProvider();
}

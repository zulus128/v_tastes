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
    return input.providerReference === expectedReference && input.code === LOCAL_OTP_CODE
      ? 'approved'
      : 'pending';
  }
}

export function createOtpProvider(): OtpProvider {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return new FakeOtpProvider();
  }

  throw new Error('A production OTP provider is not configured. Configure Twilio Verify before deployment.');
}

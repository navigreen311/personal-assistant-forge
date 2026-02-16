import twilio from 'twilio';

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromNumber = process.env.TWILIO_PHONE_NUMBER;

const twilioClient = accountSid && authToken ? twilio(accountSid, authToken) : null;

export type SMSOptions = {
  to: string;
  body: string;
  from?: string;
};

export async function sendSMS(options: SMSOptions): Promise<string | null> {
  if (!twilioClient) {
    console.warn('[SMS] Twilio not configured');
    return null;
  }

  try {
    const message = await twilioClient.messages.create({
      to: options.to,
      from: options.from ?? fromNumber,
      body: options.body,
    });
    return message.sid;
  } catch (error) {
    console.error('[SMS] Send failed:', error);
    return null;
  }
}

export async function makeCall(to: string, twimlUrl: string): Promise<string | null> {
  if (!twilioClient) {
    console.warn('[SMS] Twilio not configured');
    return null;
  }

  try {
    const call = await twilioClient.calls.create({
      to,
      from: fromNumber!,
      url: twimlUrl,
    });
    return call.sid;
  } catch (error) {
    console.error('[Telephony] Call failed:', error);
    return null;
  }
}

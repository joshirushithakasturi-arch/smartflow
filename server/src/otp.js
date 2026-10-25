import dotenv from 'dotenv';
dotenv.config({ path: new URL('../.env', import.meta.url).pathname });

export async function sendEmployeeOtp(phone) {
  const mode = process.env.OTP_MODE || 'development';
  if (mode === 'twilio') {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) throw new Error('SMS verification is not configured. Ask the system administrator.');
    const twilio = (await import('twilio')).default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    await twilio.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verifications.create({ to: phone, channel: 'sms' });
    return { mode: 'twilio' };
  }
  const code = String(Math.floor(100000 + Math.random() * 900000));
  globalThis.__smartflowOtps ||= new Map();
  globalThis.__smartflowOtps.set(phone, { code, expiresAt: Date.now() + 5 * 60 * 1000, attempts: 0 });
  console.log(`\n[DEV ONLY] SmartFlow OTP for ${phone}: ${code} (expires in 5 minutes)\n`);
  return { mode: 'development' };
}
export async function verifyEmployeeOtp(phone, code) {
  if ((process.env.OTP_MODE || 'development') === 'twilio') {
    const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_VERIFY_SERVICE_SID } = process.env;
    if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_VERIFY_SERVICE_SID) throw new Error('SMS verification is not configured.');
    const twilio = (await import('twilio')).default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const result = await twilio.verify.v2.services(TWILIO_VERIFY_SERVICE_SID).verificationChecks.create({ to: phone, code });
    return result.status === 'approved';
  }
  const store = globalThis.__smartflowOtps;
  const item = store?.get(phone);
  if (!item || Date.now() > item.expiresAt || item.attempts >= 5) { store?.delete(phone); return false; }
  item.attempts++;
  if (item.code !== String(code)) return false;
  store.delete(phone);
  return true;
}

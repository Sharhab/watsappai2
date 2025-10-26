import twilio from "twilio";

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function sendTemplate(to, fromWhatsApp, templateSid, variables = {}, statusCallback) {
  const msg = await twilioClient.messages.create({
    from: fromWhatsApp,
    to,
    contentSid: templateSid,
    contentVariables: JSON.stringify(variables),
    ...(statusCallback ? { statusCallback } : {})
  });
  console.log(`📤 Template: ${msg.sid} -> ${msg.status}`);
  return msg;
}

export async function sendWithRetry(opts, maxRetries = 2) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const msg = await twilioClient.messages.create(opts);
      console.log(`📤 Message: ${msg.sid} -> ${msg.status}`);
      return msg;
    } catch (err) {
      console.warn(`Attempt ${attempt + 1} failed:`, err.message);
      if (attempt === maxRetries) throw err;
      await new Promise(r => setTimeout(r, 2000 * Math.pow(2, attempt)));
      attempt++;
    }
  }
}

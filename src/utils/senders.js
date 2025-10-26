import twilio from "twilio";

export async function sendTemplate(to, from, templateSid, variables = {}, statusCallback) {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

  // Convert {1: "Sharhabilu"} → Twilio required JSON format
  const formattedVars = {};
  for (const key in variables) {
    formattedVars[key.toString()] = variables[key];
  }

  return client.messages.create({
    from,
    to,
    contentSid: templateSid,
    contentVariables: JSON.stringify(formattedVars),
    ...(statusCallback ? { statusCallback } : {})
  });
}

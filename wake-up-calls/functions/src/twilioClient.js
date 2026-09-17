const twilio = require("twilio");
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = require("./config");

function getClient() {
  return twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
}

/** Places the outbound wake-up call and returns the Twilio Call SID. */
async function placeCall({ toPhone, voiceWebhookUrl, statusCallbackUrl }) {
  const client = getClient();
  const call = await client.calls.create({
    to: toPhone,
    from: TWILIO_FROM_NUMBER.value(),
    url: voiceWebhookUrl,
    method: "POST",
    // Catches "never answered" / busy / failed calls, where Twilio never
    // hits voiceWebhook or gatherWebhook at all - without this, those
    // calls would sit at status "calling" forever with no retry queued.
    statusCallback: statusCallbackUrl,
    statusCallbackMethod: "POST",
    statusCallbackEvent: ["completed"],
  });
  return call.sid;
}

/** Sends the countdown SMS immediately after a confirmed call. */
async function sendSms({ toPhone, body }) {
  const client = getClient();
  const message = await client.messages.create({
    to: toPhone,
    from: TWILIO_FROM_NUMBER.value(),
    body,
  });
  return message.sid;
}

module.exports = { placeCall, sendSms };

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { FieldValue } = require("firebase-admin/firestore");
const { sendSms } = require("./twilioClient");
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, PUBLIC_BASE_URL } = require("./config");

/**
 * Fires the countdown SMS the moment a callEvent flips to "confirmed".
 * Split out from the gatherWebhook so a slow SMS send can never delay
 * the TwiML response Twilio is waiting on. Guarded by `smsSentAt` so a
 * retried trigger invocation (Firestore triggers are at-least-once)
 * can't send the text twice.
 */
const onCallConfirmed = onDocumentUpdated(
  { document: "callEvents/{eventId}", secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER], region: "europe-west2" },
  async (event) => {
    const before = event.data.before.data();
    const after = event.data.after.data();
    if (before.status === "confirmed" || after.status !== "confirmed") {
      return;
    }
    if (after.smsSentAt) {
      return;
    }

    const eventRef = event.data.after.ref;
    // Claim the send first so a concurrent retry of this trigger backs off.
    await eventRef.update({ smsSentAt: FieldValue.serverTimestamp() });

    const countdownUrl = `${PUBLIC_BASE_URL.value()}/countdown.html?token=${encodeURIComponent(after.countdownToken)}`;
    const body = `You have ${after.countdownMinutes} minutes to get to college. Track it here: ${countdownUrl}`;

    try {
      await sendSms({ toPhone: after.phone, body });
    } catch (err) {
      // Sending failed after we'd already claimed it - clear the claim so
      // the next write to this doc (there won't be one automatically) or a
      // manual admin retry could resend. Logged for the admin to notice.
      await eventRef.update({ smsSentAt: null });
      throw err;
    }
  }
);

module.exports = { onCallConfirmed };

const crypto = require("crypto");
const twilio = require("twilio");
const { onRequest } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { loadSettings, buildGreetingTwiml, buildConfirmedTwiml, buildUnconfirmedTwiml } = require("./helpers");
const { TWILIO_AUTH_TOKEN, PUBLIC_BASE_URL } = require("./config");

const XML_HEADERS = { "Content-Type": "text/xml" };

/**
 * Rejects any request to a Twilio webhook that doesn't carry a valid
 * X-Twilio-Signature for our auth token - stops anyone else from POSTing
 * fake "confirmed" or "call now" hits directly at these public URLs.
 */
function isValidTwilioRequest(req) {
  const signature = req.get("X-Twilio-Signature");
  const fullUrl = `${PUBLIC_BASE_URL.value()}${req.originalUrl}`;
  return twilio.validateRequest(TWILIO_AUTH_TOKEN.value(), signature, fullUrl, req.body || {});
}

/**
 * First TwiML Twilio requests once the call connects: plays the one
 * configured message (TTS or recorded), then gathers the student ID.
 */
const voiceWebhook = onRequest(
  { secrets: [TWILIO_AUTH_TOKEN], region: "europe-west2" },
  async (req, res) => {
    if (!isValidTwilioRequest(req)) {
      res.status(403).send("Invalid signature");
      return;
    }
    const callEventId = req.query.callEventId;
    if (!callEventId) {
      res.status(400).send("Missing callEventId");
      return;
    }
    const db = getFirestore();
    const eventSnap = await db.collection("callEvents").doc(callEventId).get();
    if (!eventSnap.exists) {
      res.status(404).send("Unknown call event");
      return;
    }
    const event = eventSnap.data();
    const settings = await loadSettings(db);
    const gatherActionUrl = `${PUBLIC_BASE_URL.value()}/gatherWebhook?callEventId=${encodeURIComponent(callEventId)}`;

    res.set(XML_HEADERS).send(
      buildGreetingTwiml({
        settings,
        gatherActionUrl,
        studentIdLength: event.studentCode ? String(event.studentCode).length : null,
      })
    );
  }
);

/**
 * Twilio posts the keyed digits here. Correct student ID confirms the
 * call (SMS follow-up is sent by the onCallConfirmed Firestore trigger);
 * anything else queues a retry per settings.retryMinutes, with no cap -
 * only the student's `enabled` toggle stops retries.
 *
 * NOTE (flagged, not solved here): this only checks the digits against
 * the student's ID. It cannot verify that the person who answered the
 * phone and typed them in is actually the student.
 */
const gatherWebhook = onRequest(
  { secrets: [TWILIO_AUTH_TOKEN], region: "europe-west2" },
  async (req, res) => {
    if (!isValidTwilioRequest(req)) {
      res.status(403).send("Invalid signature");
      return;
    }
    const callEventId = req.query.callEventId;
    if (!callEventId) {
      res.status(400).send("Missing callEventId");
      return;
    }
    const db = getFirestore();
    const eventRef = db.collection("callEvents").doc(callEventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      res.status(404).send("Unknown call event");
      return;
    }
    const event = eventSnap.data();
    const digits = (req.body && req.body.Digits) || "";
    const settings = await loadSettings(db);
    const studentRef = db.collection("students").doc(event.studentId);

    if (digits && digits === String(event.studentCode)) {
      const countdownToken = crypto.randomBytes(16).toString("hex");
      await eventRef.update({
        status: "confirmed",
        confirmedAt: FieldValue.serverTimestamp(),
        countdownMinutes: settings.countdownMinutes,
        countdownToken,
      });
      await studentRef.update({ status: "confirmed", currentCallEventId: null });
      res.set(XML_HEADERS).send(buildConfirmedTwiml(settings.countdownMinutes));
      return;
    }

    const nextAttemptAt = new Date(Date.now() + settings.retryMinutes * 60 * 1000);
    await eventRef.update({
      status: "retry_scheduled",
      nextAttemptAt,
    });
    await studentRef.update({ status: "unconfirmed", currentCallEventId: null });
    res.set(XML_HEADERS).send(buildUnconfirmedTwiml());
  }
);

/**
 * Twilio's call-completion callback (statusCallback). Covers the calls
 * that never even reach voiceWebhook/gatherWebhook at all - no-answer,
 * busy, failed, canceled. Without this, those calls would sit at
 * status "calling" forever with no retry ever queued.
 *
 * Only acts if the event is still "calling" for THIS call attempt (SID
 * match) - if gatherWebhook already resolved it, or a newer attempt has
 * since been fired, a late/duplicate status callback is a no-op.
 */
const callStatusWebhook = onRequest(
  { secrets: [TWILIO_AUTH_TOKEN], region: "europe-west2" },
  async (req, res) => {
    if (!isValidTwilioRequest(req)) {
      res.status(403).send("Invalid signature");
      return;
    }
    const callEventId = req.query.callEventId;
    if (!callEventId) {
      res.status(400).send("Missing callEventId");
      return;
    }
    const db = getFirestore();
    const eventRef = db.collection("callEvents").doc(callEventId);
    const eventSnap = await eventRef.get();
    if (!eventSnap.exists) {
      res.status(404).send("Unknown call event");
      return;
    }
    const event = eventSnap.data();
    const callSid = req.body && req.body.CallSid;

    if (event.status === "calling" && callSid && callSid === event.callSid) {
      const settings = await loadSettings(db);
      const nextAttemptAt = new Date(Date.now() + settings.retryMinutes * 60 * 1000);
      await eventRef.update({ status: "retry_scheduled", nextAttemptAt });
      await db.collection("students").doc(event.studentId).update({
        status: "unconfirmed",
        currentCallEventId: null,
      });
    }

    res.status(200).send("OK");
  }
);

module.exports = { voiceWebhook, gatherWebhook, callStatusWebhook };

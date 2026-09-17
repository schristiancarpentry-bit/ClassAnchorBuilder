const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { placeCall } = require("./twilioClient");
const { voiceWebhookUrl, callStatusWebhookUrl } = require("./dispatch");
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, PUBLIC_BASE_URL } = require("./config");

/**
 * Admin "call now" test button. Ignores the student's `enabled` flag and
 * scheduled callTime - it's a manual test trigger, not a real wake-up -
 * and never blocks or gets blocked by that day's real scheduled call.
 */
const callNow = onCall(
  { secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER], region: "europe-west2" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in as the college admin first.");
    }
    const studentId = request.data && request.data.studentId;
    if (!studentId) {
      throw new HttpsError("invalid-argument", "studentId is required.");
    }

    const db = getFirestore();
    const studentSnap = await db.collection("students").doc(studentId).get();
    if (!studentSnap.exists) {
      throw new HttpsError("not-found", "No such student.");
    }
    const student = studentSnap.data();

    const callEventRef = db.collection("callEvents").doc();
    await callEventRef.set({
      studentId,
      studentName: student.name,
      studentCode: student.studentId,
      phone: student.phone,
      date: null,
      firedAt: FieldValue.serverTimestamp(),
      confirmedAt: null,
      attempts: 0,
      status: "queued",
      countdownMinutes: null,
      countdownToken: null,
      nextAttemptAt: null,
      callSid: null,
      smsSentAt: null,
      isTest: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    const callSid = await placeCall({
      toPhone: student.phone,
      voiceWebhookUrl: voiceWebhookUrl(callEventRef.id),
      statusCallbackUrl: callStatusWebhookUrl(callEventRef.id),
    });

    await callEventRef.update({ status: "calling", attempts: 1, callSid });
    await studentSnap.ref.update({ status: "calling", currentCallEventId: callEventRef.id });

    return { callEventId: callEventRef.id, callSid };
  }
);

module.exports = { callNow };

const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getLocalParts, loadSettings } = require("./helpers");
const { placeCall } = require("./twilioClient");
const { PUBLIC_BASE_URL } = require("./config");

function voiceWebhookUrl(callEventId) {
  return `${PUBLIC_BASE_URL.value()}/voiceWebhook?callEventId=${encodeURIComponent(callEventId)}`;
}

function callStatusWebhookUrl(callEventId) {
  return `${PUBLIC_BASE_URL.value()}/callStatusWebhook?callEventId=${encodeURIComponent(callEventId)}`;
}

/**
 * Places (or re-places, on retry) the outbound Twilio call for one
 * callEvents doc and stamps the attempt onto both docs.
 */
async function fireCallAttempt(db, studentDoc, callEventRef, attemptsSoFar) {
  const student = studentDoc.data();
  const callSid = await placeCall({
    toPhone: student.phone,
    voiceWebhookUrl: voiceWebhookUrl(callEventRef.id),
    statusCallbackUrl: callStatusWebhookUrl(callEventRef.id),
  });

  await callEventRef.update({
    status: "calling",
    attempts: attemptsSoFar + 1,
    callSid,
    nextAttemptAt: null,
    lastFiredAt: FieldValue.serverTimestamp(),
  });
  await studentDoc.ref.update({ status: "calling", currentCallEventId: callEventRef.id });
}

async function fireNewScheduledCall(db, studentDoc, ymd) {
  const student = studentDoc.data();
  const callEventRef = db.collection("callEvents").doc();
  await callEventRef.set({
    studentId: studentDoc.id,
    studentName: student.name,
    studentCode: student.studentId,
    phone: student.phone,
    date: ymd,
    firedAt: FieldValue.serverTimestamp(),
    confirmedAt: null,
    attempts: 0,
    status: "queued",
    countdownMinutes: null,
    countdownToken: null,
    nextAttemptAt: null,
    callSid: null,
    smsSentAt: null,
    isTest: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  await fireCallAttempt(db, studentDoc, callEventRef, 0);
}

/**
 * Runs every minute. Fires each enabled student's call the minute their
 * callTime matches "now" (in the college's configured timezone), and
 * re-fires any retry that has come due. There is no attempt cap by
 * design (see product spec) - only `enabled: false` stops retries.
 */
async function dispatchCalls() {
  const db = getFirestore();
  const now = new Date();
  const settings = await loadSettings(db);
  const { hhmm, ymd } = getLocalParts(now, settings.timezone);

  const dueStudents = await db
    .collection("students")
    .where("enabled", "==", true)
    .where("callTime", "==", hhmm)
    .get();

  for (const studentDoc of dueStudents.docs) {
    const existing = await db
      .collection("callEvents")
      .where("studentId", "==", studentDoc.id)
      .where("date", "==", ymd)
      .where("isTest", "==", false)
      .limit(1)
      .get();
    if (existing.empty) {
      await fireNewScheduledCall(db, studentDoc, ymd);
    }
  }

  const dueRetries = await db
    .collection("callEvents")
    .where("status", "==", "retry_scheduled")
    .where("nextAttemptAt", "<=", Timestamp.fromDate(now))
    .get();

  for (const eventDoc of dueRetries.docs) {
    const event = eventDoc.data();
    const studentDoc = await db.collection("students").doc(event.studentId).get();
    if (!studentDoc.exists || studentDoc.data().enabled !== true) {
      await eventDoc.ref.update({ status: "stopped" });
      if (studentDoc.exists) {
        await studentDoc.ref.update({ status: "pending", currentCallEventId: null });
      }
      continue;
    }
    await fireCallAttempt(db, studentDoc, eventDoc.ref, event.attempts);
  }
}

module.exports = { dispatchCalls, fireCallAttempt, fireNewScheduledCall, voiceWebhookUrl, callStatusWebhookUrl };

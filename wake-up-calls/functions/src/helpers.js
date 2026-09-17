const { DEFAULT_SETTINGS, SETTINGS_DOC_ID } = require("./config");

/**
 * Returns "HH:mm" and "YYYY-MM-DD" for `date` in `timeZone`, using Intl
 * instead of a moment-timezone dependency.
 */
function getLocalParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const get = (type) => parts.find((p) => p.type === type).value;
  const hhmm = `${get("hour")}:${get("minute")}`;
  const ymd = `${get("year")}-${get("month")}-${get("day")}`;
  return { hhmm, ymd };
}

async function loadSettings(db) {
  const snap = await db.collection("settings").doc(SETTINGS_DOC_ID).get();
  if (!snap.exists) {
    return { ...DEFAULT_SETTINGS };
  }
  return { ...DEFAULT_SETTINGS, ...snap.data() };
}

/** Escapes text before it's interpolated into TwiML XML. */
function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Builds the initial TwiML: play the one configured message, then gather digits. */
function buildGreetingTwiml({ settings, gatherActionUrl, studentIdLength }) {
  const speakOrPlay =
    settings.messageMode === "audio" && settings.messageAudioUrl
      ? `<Play>${escapeXml(settings.messageAudioUrl)}</Play>`
      : `<Say>${escapeXml(settings.messageText)}</Say>`;

  const numDigitsAttr = studentIdLength ? ` numDigits="${studentIdLength}"` : "";

  // actionOnEmptyResult="true" is load-bearing: without it, Twilio does NOT
  // call `action` on a no-digits timeout, it just falls through to the next
  // verb - which would leave the callEvent stuck on "calling" forever with
  // no retry ever queued. This guarantees gatherWebhook always runs.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" timeout="8" finishOnKey="#" actionOnEmptyResult="true"${numDigitsAttr} action="${escapeXml(gatherActionUrl)}" method="POST">
    ${speakOrPlay}
  </Gather>
</Response>`;
}

function buildConfirmedTwiml(countdownMinutes) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Confirmed. You have ${escapeXml(String(countdownMinutes))} minutes to get to college. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

function buildUnconfirmedTwiml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>That did not match. Goodbye.</Say>
  <Hangup/>
</Response>`;
}

module.exports = {
  getLocalParts,
  loadSettings,
  buildGreetingTwiml,
  buildConfirmedTwiml,
  buildUnconfirmedTwiml,
  escapeXml,
};

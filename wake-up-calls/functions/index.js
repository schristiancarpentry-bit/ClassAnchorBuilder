const { initializeApp } = require("firebase-admin/app");
initializeApp();

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { dispatchCalls } = require("./src/dispatch");
const { voiceWebhook, gatherWebhook, callStatusWebhook } = require("./src/voice");
const { callNow } = require("./src/callNow");
const { onCallConfirmed } = require("./src/onCallConfirmed");
const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = require("./src/config");

// Fires scheduled wake-up calls at their configured callTime and re-fires
// any retry that has come due. See src/dispatch.js.
exports.dispatchCalls = onSchedule(
  { schedule: "every 1 minutes", region: "europe-west2", secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER] },
  async () => {
    await dispatchCalls();
  }
);

exports.voiceWebhook = voiceWebhook;
exports.gatherWebhook = gatherWebhook;
exports.callStatusWebhook = callStatusWebhook;
exports.callNow = callNow;
exports.onCallConfirmed = onCallConfirmed;

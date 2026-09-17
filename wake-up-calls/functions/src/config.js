const { defineSecret, defineString } = require("firebase-functions/params");

// Twilio credentials are stored as Cloud Functions secrets, never in code
// or in Firestore. Set them once per environment with:
//   firebase functions:secrets:set TWILIO_ACCOUNT_SID
//   firebase functions:secrets:set TWILIO_AUTH_TOKEN
//   firebase functions:secrets:set TWILIO_FROM_NUMBER
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER");

// The public HTTPS base URL of this deployed functions instance, e.g.
// "https://europe-west2-my-project.cloudfunctions.net". Only known after
// the first deploy, so it's a plain env param (set in functions/.env.<projectId>)
// rather than a secret. Used to build the Twilio webhook URLs.
const PUBLIC_BASE_URL = defineString("PUBLIC_BASE_URL");

const SETTINGS_DOC_ID = "global";

// Retention/back-stop defaults, used only until an admin saves real
// settings via the dashboard.
const DEFAULT_SETTINGS = {
  retryMinutes: 5,
  countdownMinutes: 15,
  retentionDays: 90,
  messageMode: "tts",
  messageText: "This is a wake-up call from your college. Please enter your student ID on the keypad now.",
  messageAudioUrl: null,
  timezone: "Europe/London",
};

module.exports = {
  TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER,
  PUBLIC_BASE_URL,
  SETTINGS_DOC_ID,
  DEFAULT_SETTINGS,
};

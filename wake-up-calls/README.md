# Wake-up Calls

Admin tool for FE college staff to schedule automated phone-call wake-ups
for students with attendance problems, with a keypad confirmation step.
Firebase (Firestore + Cloud Functions + Hosting + Auth + Storage) backend,
Twilio Programmable Voice + SMS for the calls and countdown text.

Built first: **Firestore schema, add-student flow, and the call-scheduling
loop** (scheduled call → Twilio call → keypad gather → confirm/retry →
countdown SMS). The countdown web page and a dedicated live activity feed
panel are **not built yet** — see "What's not built yet" below.

## Firestore schema

### `students/{autoId}`
| Field | Type | Notes |
|---|---|---|
| `name` | string | |
| `phone` | string | E.164, e.g. `+447700900123` |
| `studentId` | string | Numeric only. This is the exact code the student keys in on the phone — it is compared as a plain string, no fuzzing. |
| `callTime` | string | `"HH:mm"`, 24h, interpreted in `settings.timezone`. Recurs daily until toggled off. |
| `reason` | string | Free text, optional |
| `enabled` | boolean | Master on/off switch. Turning this off stops any further retries immediately. |
| `status` | string | Denormalized latest state for the dashboard list: `pending`\|`calling`\|`confirmed`\|`unconfirmed` |
| `currentCallEventId` | string\|null | Points at the in-flight `callEvents` doc, if any |
| `createdAt`, `updatedAt` | Timestamp | |

### `callEvents/{autoId}`
One doc per *day* per student for real scheduled calls (`isTest: false`);
"Call now" test calls get their own doc with `isTest: true` and `date: null`
so they never block that day's real scheduled call.

| Field | Type | Notes |
|---|---|---|
| `studentId` | string | Doc id in `students` |
| `studentName`, `studentCode`, `phone` | — | Denormalized off the student at fire time |
| `date` | string\|null | `"YYYY-MM-DD"` in `settings.timezone`; `null` for test calls |
| `firedAt` | Timestamp | First fire |
| `lastFiredAt` | Timestamp | Most recent attempt (same as `firedAt` on the first try) |
| `attempts` | number | Incremented on every Twilio call placed |
| `status` | string | `queued` → `calling` → `confirmed` \| `retry_scheduled` → `calling` → … , or `stopped` if the student was disabled mid-retry |
| `nextAttemptAt` | Timestamp\|null | Set when `retry_scheduled`; the dispatcher polls for these |
| `callSid` | string\|null | Latest Twilio Call SID |
| `confirmedAt` | Timestamp\|null | |
| `countdownMinutes` | number\|null | Snapshotted from settings at confirmation time |
| `countdownToken` | string\|null | Random token, meant to scope the (not-yet-built) countdown page |
| `smsSentAt` | Timestamp\|null | Guards against double-sending the countdown SMS |
| `isTest` | boolean | True for "call now" test calls |
| `createdAt` | Timestamp | |

### `settings/global` (singleton)
| Field | Type | Default |
|---|---|---|
| `retryMinutes` | number | 5 |
| `countdownMinutes` | number | 15 |
| `retentionDays` | number | 90 — **stored but not enforced yet**, no cleanup job exists |
| `messageMode` | `"tts"` \| `"audio"` | `"tts"` |
| `messageText` | string | used when `messageMode: "tts"` |
| `messageAudioUrl` | string\|null | Firebase Storage download URL, used when `messageMode: "audio"` |
| `timezone` | string | `"Europe/London"` |

## Call-scheduling flow (as built)

1. Admin adds a student via the dashboard (manual entry only — no MIS/register integration, by design).
2. `dispatchCalls` (Cloud Scheduler, every 1 minute) fires a new `callEvents` doc the minute a student's `callTime` matches "now" in `settings.timezone`, and separately re-fires any `retry_scheduled` event whose `nextAttemptAt` has passed. There is no attempt cap — only `enabled: false` stops retries.
3. Firing an attempt calls the Twilio Calls API with `url` pointing at `voiceWebhook`.
4. `voiceWebhook` returns TwiML: `<Say>`/`<Play>` the one configured message, then `<Gather input="dtmf">` for the student ID.
5. Twilio posts the digits to `gatherWebhook`. Exact string match against `studentCode`:
   - **Match** → `callEvents.status = "confirmed"`, says "you have X minutes to get to college", hangs up. A Firestore trigger (`onCallConfirmed`) then sends the countdown SMS (kept separate so a slow SMS send can't delay the TwiML response Twilio is waiting on).
   - **No match / no entry** → `callEvents.status = "retry_scheduled"`, `nextAttemptAt = now + retryMinutes`, hangs up. Picked up by `dispatchCalls` on a later run.
6. Both webhooks validate Twilio's `X-Twilio-Signature` and reject anything else — otherwise these are public URLs and anyone could POST a fake "confirmed" result at them.
7. "Call now" (`callNow`, a Firebase Auth–gated callable function) does the same thing on demand, ignoring `enabled` and `callTime`, for admin testing.

## What's not built yet (explicitly out of scope for this pass)
- The countdown web page the SMS links to (`countdown.html?token=...`). `countdownToken` is already generated and stored so this can be added without a schema change — it'll need its own scoped read path (a callable function, not a direct Firestore rule) so the token space isn't scannable.
- A dedicated "live activity feed" panel. The student list already listens live via `onSnapshot`, which covers the same real-time need for now.
- Automatic log clean-up against `retentionDays`.

## Three things flagged back, not decided for you
These were called out in the spec as open questions — I have **not** silently picked an answer:

1. **Who pays for Twilio usage.** The current code assumes one shared Twilio account (via Cloud Functions secrets) that you hold and absorb the cost of. If you'd rather each college connects its own Twilio account and pays a flat fee for the tool, that changes `functions/src/config.js` and `twilioClient.js` to load per-college credentials instead of a single secret set, and needs a place in `settings` to store them (encrypted, not as a plain Firestore field).
2. **Nothing stops someone other than the student answering and keying in the correct ID.** The only two things checked are "does the string of digits match `studentCode`" and "did this request really come from Twilio" (signature check). If a parent, sibling, or roommate answers and knows/guesses the ID, the call confirms. Not addressed here — flagging per the spec, not fixing it.
3. **No process for updating a student's phone number.** Right now the admin edits it the same way as any other field would need an edit UI, but the dashboard currently only supports add/remove, not edit — there's no dedicated "change number" flow, no re-verification step, and no history of what the number used to be.

## Setup

1. `firebase projects:create` (or use an existing project), then set it in `.firebaserc` in place of the placeholder.
2. Enable in the Firebase console: **Authentication** (Email/Password provider) and create the one admin user; **Firestore** (production mode); **Storage**.
3. Fill in `public/js/firebase-config.js` with the Web app config from Project settings.
4. Set Twilio secrets and the public base URL:
   ```
   firebase functions:secrets:set TWILIO_ACCOUNT_SID
   firebase functions:secrets:set TWILIO_AUTH_TOKEN
   firebase functions:secrets:set TWILIO_FROM_NUMBER
   ```
   After the first `firebase deploy --only functions`, note the deployed HTTPS function base URL (`https://<region>-<project>.cloudfunctions.net`) and put it in `functions/.env.<project-id>` as `PUBLIC_BASE_URL=...`, then redeploy functions once more so the webhook URLs are correct.
5. `firebase deploy --only firestore:rules,firestore:indexes,functions,hosting`
6. In Firestore, create `settings/global` with at least `messageText` set (or just save once from the dashboard's Settings tab — it fills in defaults).
7. Region is fixed to `europe-west2` throughout (functions and the client's `FUNCTIONS_REGION`) — change both together if you deploy elsewhere.

This has not been deployed or run against a live Firebase project or Twilio account in this session — there's no project/credentials available here to do that against. Syntax-checked locally; needs a real end-to-end test (one real student, one real call) before relying on it.

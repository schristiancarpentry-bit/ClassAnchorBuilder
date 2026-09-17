import { app, requireAdmin, logout } from "./auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-functions.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";
import { FUNCTIONS_REGION } from "./firebase-config.js";

const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, FUNCTIONS_REGION);
const callNowFn = httpsCallable(functions, "callNow");

document.getElementById("btnLogout").addEventListener("click", logout);

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
  });
});

requireAdmin((user) => {
  document.getElementById("collegeAdminEmail").textContent = user.email || "";
  wireStudents();
  wireSettings();
});

// ---------- Students ----------

function wireStudents() {
  const tbody = document.getElementById("studentsTbody");
  const errorEl = document.getElementById("addStudentError");
  const successEl = document.getElementById("addStudentSuccess");

  onSnapshot(query(collection(db, "students"), orderBy("callTime")), (snap) => {
    if (snap.empty) {
      tbody.innerHTML = `<tr><td colspan="8" class="hint">No students yet — add one above.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    snap.forEach((docSnap) => {
      tbody.appendChild(renderStudentRow(docSnap.id, docSnap.data()));
    });
  });

  document.getElementById("btnAddStudent").addEventListener("click", async () => {
    errorEl.textContent = "";
    successEl.textContent = "";
    const name = document.getElementById("f_name").value.trim();
    const phone = document.getElementById("f_phone").value.trim();
    const studentId = document.getElementById("f_studentId").value.trim();
    const callTime = document.getElementById("f_callTime").value;
    const reason = document.getElementById("f_reason").value.trim();

    if (!name || !phone || !studentId || !callTime) {
      errorEl.textContent = "Name, phone, student ID and call time are all required.";
      return;
    }
    if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
      errorEl.textContent = "Phone must be in E.164 format, e.g. +447700900123.";
      return;
    }
    if (!/^\d+$/.test(studentId)) {
      errorEl.textContent = "Student ID must be numeric only.";
      return;
    }

    try {
      await addDoc(collection(db, "students"), {
        name,
        phone,
        studentId,
        callTime,
        reason,
        enabled: true,
        status: "pending",
        currentCallEventId: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      document.getElementById("addStudentForm").reset();
      successEl.textContent = `Added ${name}.`;
      setTimeout(() => (successEl.textContent = ""), 3000);
    } catch (err) {
      errorEl.textContent = "Could not add student — try again.";
    }
  });
}

function renderStudentRow(id, student) {
  const tr = document.createElement("tr");

  const status = student.status || "pending";
  const statusLabel = { pending: "Pending", calling: "Calling", confirmed: "Confirmed", unconfirmed: "Unconfirmed" }[status] || status;

  tr.innerHTML = `
    <td>${escapeHtml(student.name)}</td>
    <td class="mono">${escapeHtml(student.phone)}</td>
    <td class="mono">${escapeHtml(student.studentId)}</td>
    <td class="mono">${escapeHtml(student.callTime)}</td>
    <td>${escapeHtml(student.reason || "")}</td>
    <td><span class="status-pill status-${status}">${statusLabel}</span></td>
    <td><button class="toggle ${student.enabled ? "on" : ""}" aria-label="Enabled"></button></td>
    <td class="row-actions">
      <button class="icon-btn btn-call-now">Call now</button>
      <button class="icon-btn btn-remove">Remove</button>
    </td>
  `;

  tr.querySelector(".toggle").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    const next = !btn.classList.contains("on");
    btn.classList.toggle("on", next);
    await updateDoc(doc(db, "students", id), {
      enabled: next,
      updatedAt: serverTimestamp(),
      ...(next ? {} : { status: "pending", currentCallEventId: null }),
    });
  });

  tr.querySelector(".btn-call-now").addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = "Calling…";
    try {
      await callNowFn({ studentId: id });
    } catch (err) {
      alert(`Call failed: ${err.message || err}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Call now";
    }
  });

  tr.querySelector(".btn-remove").addEventListener("click", async () => {
    if (!confirm(`Remove ${student.name} from the wake-up list?`)) return;
    await deleteDoc(doc(db, "students", id));
  });

  return tr;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// ---------- Settings ----------

function wireSettings() {
  const modeSelect = document.getElementById("s_messageMode");
  const ttsBlock = document.getElementById("ttsBlock");
  const audioBlock = document.getElementById("audioBlock");
  const errorEl = document.getElementById("settingsError");
  const successEl = document.getElementById("settingsSuccess");
  const settingsRef = doc(db, "settings", "global");

  const updateModeVisibility = () => {
    const isAudio = modeSelect.value === "audio";
    ttsBlock.style.display = isAudio ? "none" : "block";
    audioBlock.style.display = isAudio ? "block" : "none";
  };
  modeSelect.addEventListener("change", updateModeVisibility);

  let currentAudioUrl = null;

  onSnapshot(settingsRef, (snap) => {
    const s = snap.exists() ? snap.data() : {};
    modeSelect.value = s.messageMode || "tts";
    document.getElementById("s_messageText").value =
      s.messageText || "This is a wake-up call from your college. Please enter your student ID on the keypad now.";
    document.getElementById("s_retryMinutes").value = s.retryMinutes ?? 5;
    document.getElementById("s_countdownMinutes").value = s.countdownMinutes ?? 15;
    document.getElementById("s_retentionDays").value = s.retentionDays ?? 90;
    document.getElementById("s_timezone").value = s.timezone || "Europe/London";
    currentAudioUrl = s.messageAudioUrl || null;
    document.getElementById("currentAudioHint").textContent = currentAudioUrl
      ? "A recording is already uploaded. Choose a new file to replace it."
      : "No recording uploaded yet.";
    updateModeVisibility();
  });

  document.getElementById("btnSaveSettings").addEventListener("click", async () => {
    errorEl.textContent = "";
    successEl.textContent = "";
    const messageMode = modeSelect.value;
    const retryMinutes = Number(document.getElementById("s_retryMinutes").value);
    const countdownMinutes = Number(document.getElementById("s_countdownMinutes").value);
    const retentionDays = Number(document.getElementById("s_retentionDays").value);
    const timezone = document.getElementById("s_timezone").value.trim() || "Europe/London";

    if (!retryMinutes || !countdownMinutes || !retentionDays) {
      errorEl.textContent = "Retry interval, countdown length and retention days must all be positive numbers.";
      return;
    }
    if (messageMode === "tts" && !document.getElementById("s_messageText").value.trim()) {
      errorEl.textContent = "Enter the message text, or switch to an uploaded recording.";
      return;
    }

    const payload = {
      messageMode,
      messageText: document.getElementById("s_messageText").value.trim(),
      retryMinutes,
      countdownMinutes,
      retentionDays,
      timezone,
      updatedAt: serverTimestamp(),
    };

    try {
      const file = document.getElementById("s_audioFile").files[0];
      if (messageMode === "audio" && file) {
        const ext = file.name.split(".").pop();
        const fileRef = ref(storage, `messages/voice.${ext}`);
        await uploadBytes(fileRef, file);
        payload.messageAudioUrl = await getDownloadURL(fileRef);
      } else if (messageMode === "audio") {
        payload.messageAudioUrl = currentAudioUrl;
        if (!currentAudioUrl) {
          errorEl.textContent = "Upload a recording, or switch to text-to-speech.";
          return;
        }
      }

      await setDoc(settingsRef, payload, { merge: true });
      successEl.textContent = "Settings saved.";
      setTimeout(() => (successEl.textContent = ""), 3000);
    } catch (err) {
      errorEl.textContent = "Could not save settings — try again.";
    }
  });
}

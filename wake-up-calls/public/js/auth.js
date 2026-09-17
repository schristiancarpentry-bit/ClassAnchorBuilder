import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

export function requireAdmin(onSignedIn) {
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.replace("index.html");
      return;
    }
    onSignedIn(user);
  });
}

export async function login(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function logout() {
  await signOut(auth);
  window.location.replace("index.html");
}

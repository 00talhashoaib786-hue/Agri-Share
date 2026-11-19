/*
  Agri-Share: Firebase connection (Firestore + Email/Password Authentication)
  ---------------------------------------------------------------------------
  Project: agri-share-70fb1 (Spark plan)

  Before the first deploy, in the Firebase console:
  1. Authentication > Sign-in method > enable "Email/Password".
     Optional: enable "Phone" too. Firebase only sends SMS codes on the Blaze
     (pay as you go) plan; on Spark the app shows a clear message and the
     farmer can use email instead.
  2. Firestore Database > Create database (asia-south1 is closest to Pakistan).
     This project uses the database ID "default" (see FIRESTORE_DATABASE_ID below).
  3. Firestore Database > pick the "default" database in the database dropdown >
     Rules: paste the contents of firestore.rules and Publish
     (or run: firebase deploy --only firestore:rules, which uses firebase.json).
  4. Authentication > Settings > Authorized domains: add your Vercel domain,
     for example agri-share.vercel.app (localhost is already allowed).

  Collections used by the app:
    machinery_listings   one document per machine listing
    indrive_requests     one document per live (InDrive mode) request
    bookings             one document per booking
    mandi_crops          one document per Agri-Market crop post
    admin_settings       "pilot": diesel rate and active provinces (admins write)
                         "security": admin password hash (founder writes, admins read)
                         "team": authorised team admin emails (founder writes)
    users                one profile per signed-up member (document id = auth uid)
    pending_demand_requests  farmer requests saved when no owner was available (zero-supply fallback)

  The web config below is not a secret: it only identifies the project.
  Security comes from the Firestore rules in firestore.rules.

  If Firebase is unreachable, the rules refuse a request, or Email/Password
  sign-in is not enabled yet, the app keeps working on localStorage.
*/
import { initializeApp, getApps } from "firebase/app";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache,
  collection, doc, onSnapshot, setDoc, deleteDoc, getDoc,
} from "firebase/firestore";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, updateProfile, RecaptchaVerifier, signInWithPhoneNumber, sendEmailVerification,
} from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyC32Nbbi1UDyFF8bul3OXfHIa9Oq5-WeuE",
  authDomain: "agri-share-70fb1.firebaseapp.com",
  projectId: "agri-share-70fb1",
  storageBucket: "agri-share-70fb1.firebasestorage.app",
  messagingSenderId: "317433822064",
  appId: "1:317433822064:web:a37f284d7ad39b9ffa2db5",
  measurementId: "G-LNDFZ67DQ0",
};

// Set to false to run the app on localStorage only (no cloud at all).
export const FIREBASE_ENABLED = true;

// Firestore database ID. This project's database was created with the ID "default"
// (a named database), NOT the built-in "(default)" one. Using the wrong ID means every
// listener waits forever and the app shows "Offline". Change this if you recreate the database.
export const FIRESTORE_DATABASE_ID = "default";

export const COL = {
  listings: "machinery_listings",
  requests: "indrive_requests",
  bookings: "bookings",
  mandi: "mandi_crops",
  settings: "admin_settings",
  users: "users",
  demand: "pending_demand_requests",
};

let app = null, auth = null;
// The Firestore instance for database "default" (FIRESTORE_DATABASE_ID). Exported as a live binding:
// it is set on first use (see init) and is equivalent to getFirestore(app, "default") plus the offline cache.
export let db = null;

function init() {
  if (app) return true;
  try {
    app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    try {
      // Offline cache shared by all open tabs, so the app still loads data without network
      db = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true, localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }, FIRESTORE_DATABASE_ID);
    } catch (e) {
      try { db = initializeFirestore(app, { ignoreUndefinedProperties: true, experimentalAutoDetectLongPolling: true, localCache: memoryLocalCache() }, FIRESTORE_DATABASE_ID); } catch (e2) { db = getFirestore(app, FIRESTORE_DATABASE_ID); }
    }
    auth = getAuth(app);
    return true;
  } catch (e) {
    console.warn("[Agri-Share] Firebase could not start. Using localStorage only.", e);
    app = null; db = null; auth = null;
    return false;
  }
}

export function cloudAvailable() {
  return FIREBASE_ENABLED && init();
}

// Firestore rejects undefined, functions and NaN; a JSON round trip removes them.
const clean = (data) => JSON.parse(JSON.stringify(data));
const safeId = (id) => String(id).replace(/\//g, "_");

/* Live listener on a whole collection.
   onData(list, { fromCache }) gets every document as { id, ...fields }. */
export function watchCollection(name, onData, onError) {
  if (!cloudAvailable()) { if (onError) onError({ code: "unavailable" }); return () => {}; }
  try {
    return onSnapshot(
      collection(db, name),
      { includeMetadataChanges: true },
      (snap) => onData(snap.docs.map((d) => ({ ...d.data(), id: d.id })), { fromCache: snap.metadata.fromCache }),
      (err) => { logFs("listen", name, err); if (onError) onError(err); }
    );
  } catch (e) { if (onError) onError(e); return () => {}; }
}

export function watchDoc(name, id, onData, onError) {
  if (!cloudAvailable()) { if (onError) onError({ code: "unavailable" }); return () => {}; }
  try {
    return onSnapshot(
      doc(db, name, safeId(id)),
      { includeMetadataChanges: true },
      (snap) => onData(snap.exists() ? snap.data() : null, { fromCache: snap.metadata.fromCache }),
      (err) => { logFs("listen", `${name}/${id}`, err); if (onError) onError(err); }
    );
  } catch (e) { if (onError) onError(e); return () => {}; }
}

// One clean console line per Firestore failure: operation, path, database and error code
function logFs(op, path, e) {
  console.warn(`[Agri-Share] Firestore ${op} ${FIRESTORE_DATABASE_ID}/${path} failed: ${(e && e.code) || "error"}${e && e.message ? " · " + e.message : ""}`);
}

export async function writeDoc(name, id, data) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  const { id: _drop, ...rest } = data || {};
  try { await setDoc(doc(db, name, safeId(id)), clean(rest)); }
  catch (e) { logFs("write", `${name}/${id}`, e); throw e; }
}

export async function removeDoc(name, id) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  try { await deleteDoc(doc(db, name, safeId(id))); }
  catch (e) { logFs("delete", `${name}/${id}`, e); throw e; }
}

export async function readDoc(name, id) {
  if (!cloudAvailable()) return null;
  try {
    const snap = await getDoc(doc(db, name, safeId(id)));
    return snap.exists() ? snap.data() : null;
  } catch (e) { logFs("read", `${name}/${id}`, e); throw e; }
}

/* ---------------- Authentication (Email/Password) ---------------- */
export function watchAuth(cb) {
  if (!cloudAvailable()) { cb(null); return () => {}; }
  try { return onAuthStateChanged(auth, cb, () => cb(null)); } catch (e) { cb(null); return () => {}; }
}

export async function fbSignUp(email, password, displayName) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  // not awaited: the name is also kept in the users profile, so sign-up never waits on it
  updateProfile(cred.user, { displayName }).catch(() => {});
  return cred.user;
}

export async function fbSignIn(email, password) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function fbResetPassword(email) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  await sendPasswordResetEmail(auth, email);
}

/* Email verification: admin access requires a verified email (rules check email_verified) */
export async function fbSendVerification() {
  if (!cloudAvailable() || !auth.currentUser) throw Object.assign(new Error("Not signed in"), { code: "unauthenticated" });
  await sendEmailVerification(auth.currentUser);
}
// Reload the signed-in user and refresh the ID token so new claims (email_verified) reach the rules
export async function fbRefreshUser() {
  if (!cloudAvailable() || !auth.currentUser) return null;
  await auth.currentUser.reload();
  await auth.currentUser.getIdToken(true);
  return auth.currentUser;
}

export async function fbSignOut() {
  if (!cloudAvailable()) return;
  try { await signOut(auth); } catch (e) { /* already signed out */ }
}

/* ---------------- Phone OTP ----------------
   fbStartPhone("+923001234567", "recaptcha-box") sends the SMS code and returns a
   confirmation; fbConfirmPhone(confirmation, "123456") signs the user in.
   An invisible reCAPTCHA runs in the element with the given id. */
let verifier = null;
export async function fbStartPhone(phoneE164, containerId) {
  if (!cloudAvailable()) throw Object.assign(new Error("Firebase unavailable"), { code: "unavailable" });
  try {
    if (verifier) { try { verifier.clear(); } catch (e) { /* ignore */ } verifier = null; }
    verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
    return await signInWithPhoneNumber(auth, phoneE164, verifier);
  } catch (e) {
    if (verifier) { try { verifier.clear(); } catch (e2) { /* ignore */ } verifier = null; }
    throw e;
  }
}

export async function fbConfirmPhone(confirmation, code) {
  const cred = await confirmation.confirm(code);
  return cred.user;
}

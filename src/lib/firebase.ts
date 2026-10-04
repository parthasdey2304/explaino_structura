import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes, getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

if (typeof window !== 'undefined') {
  // Debug: verify Vercel env wiring in the browser console (presence only, never values).
  console.log('[firebase] env present:', {
    apiKey: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    authDomain: Boolean(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN),
    projectId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID),
    storageBucket: Boolean(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID),
    appId: Boolean(process.env.NEXT_PUBLIC_FIREBASE_APP_ID),
  });
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { app, auth, db, storage };
export default firebaseConfig;

export interface FirebaseHealth {
  firestore: boolean;
  storage: boolean;
  detail: string;
}

/**
 * Self-test: writes a heartbeat doc to Firestore and a tiny probe file to
 * Storage (deleted right after), then reports what actually works.
 * Call once on the client and read the browser console.
 */
export async function checkFirebaseConnection(): Promise<FirebaseHealth> {
  const missing = Object.entries(firebaseConfig)
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length > 0 || !db || !storage) {
    const detail = `missing env: ${missing.join(', ') || 'sdk not initialised'}`;
    console.log('[firebase] health check FAILED —', detail);
    return { firestore: false, storage: false, detail };
  }
  let firestore = false;
  let storageOk = false;
  let detail = '';
  try {
    const pingRef = doc(db, 'explanio_health', 'ping');
    await setDoc(pingRef, { ts: Date.now(), from: 'explaino_structura' });
    const back = await getDoc(pingRef);
    firestore = back.exists();
    detail += firestore ? 'firestore write+read ok. ' : 'firestore write ok but read-back missing. ';
  } catch (e) {
    detail += `firestore FAILED (${e instanceof Error ? e.message : String(e)}). `;
  }
  try {
    const probe = ref(storage, 'explanio/__health__.txt');
    await uploadBytes(probe, new Blob(['ok'], { type: 'text/plain' }));
    await getDownloadURL(probe);
    await deleteObject(probe);
    storageOk = true;
    detail += 'storage write+read+delete ok.';
  } catch (e) {
    detail += `storage FAILED (${e instanceof Error ? e.message : String(e)}).`;
  }
  console.log('[firebase] health check:', { firestore, storage: storageOk, detail });
  return { firestore, storage: storageOk, detail };
}
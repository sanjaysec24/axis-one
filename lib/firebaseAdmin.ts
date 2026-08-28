import { initializeApp, getApps, getApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

let mockFirestoreDb: any = null;

/**
 * Registers a mock Firestore database for unit testing and CI test environments.
 */
export function registerMockFirestore(mockDb: any): void {
  mockFirestoreDb = mockDb;
}

/**
 * Resets the registered mock Firestore instance.
 */
export function resetMockFirestore(): void {
  mockFirestoreDb = null;
}

/**
 * Checks if all required Firebase Admin environment variables are configured.
 */
export function isFirebaseConfigured(): boolean {
  return !!(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  );
}

/**
 * Returns the initialized Firebase Admin App instance.
 * Reuses existing app to prevent duplicate initialization during Next.js hot reload.
 */
function getFirebaseAdminApp(): App {
  if (getApps().length > 0) {
    return getApp();
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase Admin credentials are not configured. Please ensure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY are set in server environment."
    );
  }

  // Handle quotes and multi-line RSA private key formatted with escaped newlines
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  return initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
}

/**
 * Returns the server-side Cloud Firestore instance.
 * Throws a descriptive error if environment credentials are not present and no mock is registered.
 */
export function getFirestoreDb(): Firestore {
  // If mock database is registered for testing, return it
  if (mockFirestoreDb) {
    return mockFirestoreDb as Firestore;
  }

  const app = getFirebaseAdminApp();
  return getFirestore(app);
}

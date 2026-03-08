import * as admin from 'firebase-admin';

function getAdminApp(): admin.app.App {
  if (admin.apps.length) return admin.apps[0]!;

  const projectId  = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey  = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    // Allow the app to boot without credentials in dev — ops that need admin will throw at call-time
    return admin.initializeApp({ projectId });
  }

  return admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

const adminApp = getAdminApp();

export const adminDb      = admin.firestore(adminApp);
export const adminAuth    = admin.auth(adminApp);
export const adminStorage = admin.storage(adminApp);
export default adminApp;

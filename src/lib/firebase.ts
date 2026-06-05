import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import { env } from '$env/dynamic/public';

const firebaseConfig = {
  apiKey: env.PUBLIC_FIREBASE_API_KEY,
  authDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };

/**
 * ログイン中のユーザーが「管理者」かどうかを判定する
 * @param uid ユーザーのUID
 * @returns 管理者の場合はtrue、そうでない場合はfalse
 */
export async function checkIsAdmin(uid: string | undefined | null): Promise<boolean> {
  if (!uid) return false;

  // 1. 特権ID (OWNER_UID) と一致するかチェック
  if (env.PUBLIC_OWNER_UID && uid === env.PUBLIC_OWNER_UID) {
    return true;
  }

  // 2. Firestoreの `users` コレクションをチェック
  try {
    const userDocRef = doc(db, 'users', uid);
    const userDoc = await getDoc(userDocRef);
    if (userDoc.exists()) {
      const userData = userDoc.data();
      return userData.isAdmin === true;
    }
  } catch (error) {
    console.error('Error checking admin status:', error);
  }

  return false;
}

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, doc, getDoc } from 'firebase/firestore';
import {
	PUBLIC_FIREBASE_API_KEY,
	PUBLIC_FIREBASE_AUTH_DOMAIN,
	PUBLIC_FIREBASE_PROJECT_ID,
	PUBLIC_FIREBASE_STORAGE_BUCKET,
	PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
	PUBLIC_FIREBASE_APP_ID,
	PUBLIC_OWNER_UID
} from '$env/static/public';

console.log('[Firebase Init] API Key loaded from static public env:', PUBLIC_FIREBASE_API_KEY ? 'FOUND' : 'NOT FOUND');

const firebaseConfig = {
	apiKey: PUBLIC_FIREBASE_API_KEY || 'AIzaSyDBlV6UmaJJeu-PNuYWJfkrMmVywczMK1g',
	authDomain: PUBLIC_FIREBASE_AUTH_DOMAIN || 'ipo-shift.firebaseapp.com',
	projectId: PUBLIC_FIREBASE_PROJECT_ID || 'ipo-shift',
	storageBucket: PUBLIC_FIREBASE_STORAGE_BUCKET || 'ipo-shift.firebasestorage.app',
	messagingSenderId: PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '417029960667',
	appId: PUBLIC_FIREBASE_APP_ID || '1:417029960667:web:32d8cad8352f636a94adfe'
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
	if (PUBLIC_OWNER_UID && uid === PUBLIC_OWNER_UID) {
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

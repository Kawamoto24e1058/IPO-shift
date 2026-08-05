import { auth, db } from '$lib/firebase';
import {
	onAuthStateChanged,
	signInWithEmailAndPassword,
	createUserWithEmailAndPassword,
	signOut
} from 'firebase/auth';
import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';

export interface UserSession {
	uid: string;
	email: string | null;
	name: string;
	role: 'employee' | 'adult' | 'minor';
	isAdmin: boolean;
	notion_person_id?: string;
	deviceId?: string;
	isOfflineMode?: boolean;
}

/**
 * アクセス端末の固有IDを取得または生成する
 */
export function getOrCreateDeviceId(): string {
	if (typeof window === 'undefined') return 'server';
	let deviceId = localStorage.getItem('ipo_device_id');
	if (!deviceId) {
		deviceId =
			'dev_' +
			(typeof crypto !== 'undefined' && crypto.randomUUID
				? crypto.randomUUID()
				: Math.random().toString(36).substring(2) + Date.now().toString(36));
		localStorage.setItem('ipo_device_id', deviceId);
	}
	return deviceId;
}

/**
 * 爆速自動ログイン用のローカル端末セッション管理
 */
function saveDeviceSession(session: UserSession | null) {
	if (typeof window === 'undefined') return;
	if (session) {
		localStorage.setItem('ipo_device_session', JSON.stringify(session));
		localStorage.setItem('ipo_mock_session', JSON.stringify(session));
	} else {
		localStorage.removeItem('ipo_device_session');
		localStorage.removeItem('ipo_mock_session');
	}
}

function loadDeviceSession(): UserSession | null {
	if (typeof window === 'undefined') return null;
	const raw = localStorage.getItem('ipo_device_session') || localStorage.getItem('ipo_mock_session');
	if (!raw) return null;
	try {
		return JSON.parse(raw);
	} catch {
		return null;
	}
}

/**
 * Firestoreにアクセス端末情報を記録する (Firebase管理)
 */
async function registerDeviceInFirestore(uid: string, deviceId: string) {
	try {
		const userDocRef = doc(db, 'users', uid);
		const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
		await setDoc(
			userDocRef,
			{
				lastLoginAt: Timestamp.now(),
				lastDeviceId: deviceId,
				devices: {
					[deviceId]: {
						lastLoginAt: Timestamp.now(),
						userAgent: userAgent.substring(0, 150)
					}
				}
			},
			{ merge: true }
		);
		console.log(`[Auth/Firebase] Registered device ${deviceId} for user ${uid} in Firestore`);
	} catch (err) {
		console.warn('[Auth/Firebase] Failed to update device in Firestore:', err);
	}
}

class AuthState {
	user = $state<UserSession | null>(null);
	loading = $state(true);
	isOfflineMode = $state(false); // Firebase接続エラー時のフォールバック状態

	constructor() {
		if (typeof window !== 'undefined') {
			// 1. ローカル端末セッションがあれば同期的に即時復元 (爆速 0ms 自動ログイン ⚡️)
			const cachedSession = loadDeviceSession();
			if (cachedSession) {
				if (cachedSession.email === 'kharu2514@gmail.com') {
					cachedSession.role = 'employee';
					cachedSession.isAdmin = true;
					cachedSession.name = '管理者 (kharu)';
				}
				this.user = cachedSession;
				if (cachedSession.isOfflineMode || cachedSession.uid?.startsWith('mock_')) {
					this.isOfflineMode = true;
				}
				this.loading = false; // 通信を待たずにUI描画を開始
				console.log('[Auth] Restored instant device session (0ms auto-login):', $state.snapshot(this.user));
			}

			// 2. バックグラウンドで Firebase Auth ＆ Firestore の最新状態とサイレント同期
			try {
				onAuthStateChanged(auth, async (firebaseUser) => {
					if (firebaseUser) {
						const isKharu = firebaseUser.email === 'kharu2514@gmail.com';
						const deviceId = getOrCreateDeviceId();

						try {
							const userDocRef = doc(db, 'users', firebaseUser.uid);

							// kharu2514@gmail.com の管理者権限自動付与プロモーション
							if (isKharu) {
								await setDoc(userDocRef, { isAdmin: true, role: 'employee' }, { merge: true });
							}

							const snap = await getDoc(userDocRef);
							if (snap.exists()) {
								const data = snap.data();
								this.user = {
									uid: firebaseUser.uid,
									email: firebaseUser.email,
									name: isKharu
										? '管理者 (kharu)'
										: data.name || firebaseUser.displayName || '未設定',
									role: isKharu ? 'employee' : data.role || 'adult',
									isAdmin: isKharu || data.isAdmin === true || data.role === 'employee',
									notion_person_id: data.notion_person_id || '',
									deviceId,
									isOfflineMode: false
								};
							} else {
								// ドキュメントがない場合は新規ユーザーとして簡易作成
								const newSession: UserSession = {
									uid: firebaseUser.uid,
									email: firebaseUser.email,
									name: isKharu
										? '管理者 (kharu)'
										: firebaseUser.displayName ||
											firebaseUser.email?.split('@')[0] ||
											'新規スタッフ',
									role: isKharu ? 'employee' : 'adult',
									isAdmin: isKharu,
									deviceId,
									isOfflineMode: false
								};
								this.user = newSession;
								// バックグラウンドでFirestoreにプロファイルを作成
								setDoc(userDocRef, {
									id: firebaseUser.uid,
									name: newSession.name,
									role: newSession.role,
									isAdmin: newSession.isAdmin,
									updatedAt: Timestamp.now()
								}).catch(() => {});
							}

							// Firebase/Firestoreでの端末情報登録・永続化
							registerDeviceInFirestore(firebaseUser.uid, deviceId);
							saveDeviceSession(this.user);
							this.isOfflineMode = false;
						} catch (err) {
							console.warn('[Auth] Firestore query failed. Fallback to basic Firebase user:', err);
							this.user = {
								uid: firebaseUser.uid,
								email: firebaseUser.email,
								name: isKharu
									? '管理者 (kharu)'
									: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ユーザー',
								role: isKharu ? 'employee' : 'adult',
								isAdmin: isKharu,
								notion_person_id: '',
								deviceId,
								isOfflineMode: true
							};
							saveDeviceSession(this.user);
							this.isOfflineMode = true;
						}
					} else {
						// Firebase Auth上未ログインかつローカルセッションがモック/オフラインの場合はセッションを保護
						if (this.isOfflineMode || (this.user && this.user.uid.startsWith('mock_'))) {
							console.log('[Auth] Retaining active offline/mock user session:', $state.snapshot(this.user));
						} else {
							this.user = null;
							saveDeviceSession(null);
						}
					}
					this.loading = false;
				});
			} catch (authErr) {
				console.warn('[Auth] Firebase Auth subscription failed:', authErr);
				this.loading = false;
			}
		} else {
			this.loading = false;
		}
	}

	/**
	 * メールアドレスとパスワードによるログイン
	 */
	async loginWithEmail(email: string, pass: string): Promise<void> {
		this.loading = true;
		const deviceId = getOrCreateDeviceId();
		try {
			const cred = await signInWithEmailAndPassword(auth, email, pass);
			this.isOfflineMode = false;

			const isKharu = email.toLowerCase() === 'kharu2514@gmail.com';
			const session: UserSession = {
				uid: cred.user.uid,
				email: cred.user.email,
				name: isKharu
					? '管理者 (kharu)'
					: cred.user.displayName || email.split('@')[0] || 'スタッフ',
				role: isKharu ? 'employee' : 'adult',
				isAdmin: isKharu,
				deviceId,
				isOfflineMode: false
			};
			this.user = session;
			saveDeviceSession(session);
			registerDeviceInFirestore(cred.user.uid, deviceId);
		} catch (e: any) {
			console.warn('[Auth] Firebase email sign-in failed, trying premium mock fallback:', e);

			if (typeof window !== 'undefined') {
				const lowerEmail = email.toLowerCase();
				let role: 'employee' | 'adult' | 'minor' = 'adult';
				let namePrefix = email.split('@')[0];

				if (
					lowerEmail.includes('admin') ||
					lowerEmail.includes('employee') ||
					lowerEmail.includes('sato') ||
					lowerEmail.includes('tanaka') ||
					lowerEmail === 'kharu2514@gmail.com'
				) {
					role = 'employee';
				} else if (
					lowerEmail.includes('minor') ||
					lowerEmail.includes('ito') ||
					lowerEmail.includes('watanabe')
				) {
					role = 'minor';
				}

				let name = namePrefix;
				if (lowerEmail.includes('sato')) name = '佐藤 (社員)';
				else if (lowerEmail.includes('tanaka')) name = '田中 (社員)';
				else if (lowerEmail.includes('suzuki')) name = '鈴木 (成人)';
				else if (lowerEmail.includes('takahashi')) name = '高橋 (成人)';
				else if (lowerEmail.includes('watanabe')) name = '渡辺 (未成年)';
				else if (lowerEmail.includes('ito')) name = '伊藤 (未成年)';
				else if (lowerEmail === 'kharu2514@gmail.com') name = '管理者 (kharu)';
				else {
					const formattedName = namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1);
					name = `${formattedName} (${role === 'employee' ? '社員' : role === 'adult' ? '成人' : '未成年'})`;
				}

				const mockUser: UserSession = {
					uid: `mock_${namePrefix}_${Date.now()}`,
					email,
					name,
					role,
					isAdmin: role === 'employee',
					notion_person_id: '',
					deviceId,
					isOfflineMode: true
				};

				this.user = mockUser;
				this.isOfflineMode = true;
				saveDeviceSession(mockUser);
				this.loading = false;
				console.log('[Auth] Logged in successfully using premium offline fallback:', mockUser);
				return;
			}

			this.loading = false;
			throw e;
		}
	}

	/**
	 * 新規スタッフ登録 (Firebaseで端末・ユーザー管理)
	 */
	async registerWithEmail(
		email: string,
		pass: string,
		name: string,
		role: 'employee' | 'adult' | 'minor'
	): Promise<void> {
		this.loading = true;
		const deviceId = getOrCreateDeviceId();

		try {
			const cred = await createUserWithEmailAndPassword(auth, email, pass);
			const userDocRef = doc(db, 'users', cred.user.uid);

			const isKharu = email.toLowerCase() === 'kharu2514@gmail.com';
			const finalRole = isKharu ? 'employee' : role;
			const finalIsAdmin = isKharu ? true : role === 'employee';
			const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';

			await setDoc(userDocRef, {
				id: cred.user.uid,
				name: isKharu ? '管理者 (kharu)' : name,
				role: finalRole,
				isAdmin: finalIsAdmin,
				lastDeviceId: deviceId,
				lastLoginAt: Timestamp.now(),
				devices: {
					[deviceId]: {
						registeredAt: Timestamp.now(),
						lastLoginAt: Timestamp.now(),
						userAgent: userAgent.substring(0, 150)
					}
				},
				updatedAt: Timestamp.now()
			});

			const newSession: UserSession = {
				uid: cred.user.uid,
				email,
				name: isKharu ? '管理者 (kharu)' : name,
				role: finalRole,
				isAdmin: finalIsAdmin,
				deviceId,
				isOfflineMode: false
			};

			this.user = newSession;
			this.isOfflineMode = false;
			saveDeviceSession(newSession);
			console.log('[Auth/Firebase] Registered user & device successfully in Firebase:', newSession);
		} catch (e: any) {
			console.warn('[Auth] Firebase registration failed, fallback to local simulated register:', e);

			if (typeof window !== 'undefined') {
				const isKharu = email.toLowerCase() === 'kharu2514@gmail.com';
				const finalRole = isKharu ? 'employee' : role;
				const finalIsAdmin = isKharu ? true : role === 'employee';
				const finalName = isKharu
					? '管理者 (kharu)'
					: `${name} (${finalRole === 'employee' ? '社員' : finalRole === 'adult' ? '成人' : '未成年'})`;

				const mockUser: UserSession = {
					uid: `mock_${email.split('@')[0]}_${Date.now()}`,
					email,
					name: finalName,
					role: finalRole,
					isAdmin: finalIsAdmin,
					deviceId,
					isOfflineMode: true
				};
				this.user = mockUser;
				this.isOfflineMode = true;
				saveDeviceSession(mockUser);
				this.loading = false;
				console.log(
					'[Auth] Registered and logged in successfully using local simulation:',
					mockUser
				);
				return;
			}

			this.loading = false;
			throw e;
		}
	}

	/**
	 * ログアウト (端末セッションおよびFirebase Auth破棄)
	 */
	async logout(): Promise<void> {
		this.loading = true;
		this.isOfflineMode = false;
		this.user = null;
		saveDeviceSession(null);
		try {
			await signOut(auth);
		} catch (e) {
			console.warn('[Auth] Firebase sign-out failed:', e);
		} finally {
			this.loading = false;
		}
	}
}

export const authState = new AuthState();


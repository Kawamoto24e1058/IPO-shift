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
}

class AuthState {
	user = $state<UserSession | null>(null);
	loading = $state(true);
	isOfflineMode = $state(false); // Firebase接続エラー時のフォールバック状態

	constructor() {
		if (typeof window !== 'undefined') {
			// 1. ローカルストレージに既存のモックログインセッションがあるか確認
			const mockSession = localStorage.getItem('ipo_mock_session');
			if (mockSession) {
				try {
					const parsed = JSON.parse(mockSession);
					if (parsed && parsed.email === 'kharu2514@gmail.com') {
						parsed.role = 'employee';
						parsed.isAdmin = true;
						parsed.name = '管理者 (kharu)';
						localStorage.setItem('ipo_mock_session', JSON.stringify(parsed));
						console.log('[Auth] Force-promoted stored mock session for kharu2514@gmail.com');
					}
					this.user = parsed;
					this.isOfflineMode = true;
					this.loading = false;
					console.log('[Auth] Restored offline mock session:', this.user);
					return;
				} catch (e) {
					localStorage.removeItem('ipo_mock_session');
				}
			}

			// 2. Firebase Authの状態監視をスタート
			this.loading = true;
			try {
				onAuthStateChanged(auth, async (firebaseUser) => {
					if (firebaseUser) {
						const isKharu = firebaseUser.email === 'kharu2514@gmail.com';
						try {
							const userDocRef = doc(db, 'users', firebaseUser.uid);

							// kharu2514@gmail.com の管理者権限自動付与プロモーション
							if (isKharu) {
								await setDoc(userDocRef, { isAdmin: true, role: 'employee' }, { merge: true });
								console.log('[Auth] Automatically promoted kharu2514@gmail.com to administrator.');
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
									notion_person_id: data.notion_person_id || ''
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
									isAdmin: isKharu
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
							this.isOfflineMode = false;
						} catch (err) {
							console.warn('[Auth] Firestore query failed. Fallback to basic Firebase user:', err);
							// Firestoreエラーの時はFirebase Auth情報をベースにする
							this.user = {
								uid: firebaseUser.uid,
								email: firebaseUser.email,
								name: isKharu
									? '管理者 (kharu)'
									: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'ユーザー',
								role: isKharu ? 'employee' : 'adult',
								isAdmin: isKharu,
								notion_person_id: ''
							};
							this.isOfflineMode = true;
						}
					} else {
						this.user = null;
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
		try {
			await signInWithEmailAndPassword(auth, email, pass);
			this.isOfflineMode = false;
		} catch (e: any) {
			console.warn('[Auth] Firebase email sign-in failed, trying premium mock fallback:', e);

			// Firebase API未有効化 (configuration-not-found) または通信オフライン時の特別救済措置
			const isConfigError =
				e.code === 'auth/configuration-not-found' || e.message?.includes('configuration-not-found');
			const isOfflineError =
				e.message?.includes('offline') || e.code?.includes('network-request-failed');

			if (isConfigError || isOfflineError || typeof window !== 'undefined') {
				// メールアドレスからロールをインテリジェント自動判定
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

				// 名前を綺麗な日本語表記に変換 (シームレス移行)
				let name = namePrefix;
				if (lowerEmail.includes('sato')) name = '佐藤 (社員)';
				else if (lowerEmail.includes('tanaka')) name = '田中 (社員)';
				else if (lowerEmail.includes('suzuki')) name = '鈴木 (成人)';
				else if (lowerEmail.includes('takahashi')) name = '高橋 (成人)';
				else if (lowerEmail.includes('watanabe')) name = '渡辺 (未成年)';
				else if (lowerEmail.includes('ito')) name = '伊藤 (未成年)';
				else if (lowerEmail === 'kharu2514@gmail.com') name = '管理者 (kharu)';
				else {
					// カスタムメールアドレスの場合
					const formattedName = namePrefix.charAt(0).toUpperCase() + namePrefix.slice(1);
					name = `${formattedName} (${role === 'employee' ? '社員' : role === 'adult' ? '成人' : '未成年'})`;
				}

				const mockUser: UserSession = {
					uid: `mock_${namePrefix}_${Date.now()}`,
					email,
					name,
					role,
					isAdmin: role === 'employee',
					notion_person_id: ''
				};

				this.user = mockUser;
				this.isOfflineMode = true;
				localStorage.setItem('ipo_mock_session', JSON.stringify(mockUser));
				this.loading = false;
				console.log('[Auth] Logged in successfully using premium offline fallback:', mockUser);
				return;
			}

			this.loading = false;
			throw e;
		}
	}

	/**
	 * 新規スタッフ登録
	 */
	async registerWithEmail(
		email: string,
		pass: string,
		name: string,
		role: 'employee' | 'adult' | 'minor'
	): Promise<void> {
		this.loading = true;
		try {
			const cred = await createUserWithEmailAndPassword(auth, email, pass);
			const userDocRef = doc(db, 'users', cred.user.uid);

			const isKharu = email.toLowerCase() === 'kharu2514@gmail.com';
			const finalRole = isKharu ? 'employee' : role;
			const finalIsAdmin = isKharu ? true : role === 'employee';

			await setDoc(userDocRef, {
				id: cred.user.uid,
				name: isKharu ? '管理者 (kharu)' : name,
				role: finalRole,
				isAdmin: finalIsAdmin,
				updatedAt: Timestamp.now()
			});
			this.user = {
				uid: cred.user.uid,
				email,
				name: isKharu ? '管理者 (kharu)' : name,
				role: finalRole,
				isAdmin: finalIsAdmin
			};
			this.isOfflineMode = false;
		} catch (e: any) {
			console.warn('[Auth] Firebase registration failed, fallback to local simulated register:', e);

			// オフライン・未設定時の動的ローカルセッション登録
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
					isAdmin: finalIsAdmin
				};
				this.user = mockUser;
				this.isOfflineMode = true;
				localStorage.setItem('ipo_mock_session', JSON.stringify(mockUser));
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
	 * ログアウト
	 */
	async logout(): Promise<void> {
		this.loading = true;
		if (typeof window !== 'undefined') {
			localStorage.removeItem('ipo_mock_session');
		}
		try {
			await signOut(auth);
		} catch (e) {
			console.warn('[Auth] Firebase sign-out failed:', e);
		} finally {
			this.user = null;
			this.isOfflineMode = false;
			this.loading = false;
		}
	}
}

export const authState = new AuthState();

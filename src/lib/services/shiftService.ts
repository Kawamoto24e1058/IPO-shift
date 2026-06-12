import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	where,
	writeBatch,
	setDoc,
	Timestamp
} from 'firebase/firestore';
import { db } from '$lib/firebase';

export interface WeeklyTemplate {
	dayOfWeek: number; // 0: 日曜日, 1: 月曜日, ..., 6: 土曜日
	type: 'ng' | 'specific';
	startTime: string; // "HH:MM"
	endTime: string; // "HH:MM"
}

export interface Wish {
	date: string; // "YYYY-MM-DD"
	type: 'ng' | 'specific' | 'free'; // freeは終日可や特になし
	startTime: string;
	endTime: string;
	isOverridden: boolean;
	isSubmitted: boolean;
}

export interface SystemSettings {
	deadline: Timestamp | null;
	isLocked: boolean;
}

/**
 * 曜日ごとの時間割（テンプレート）を保存する
 */
export async function saveWeeklyTemplates(
	userId: string,
	templates: WeeklyTemplate[]
): Promise<void> {
	const batch = writeBatch(db);

	// 既存のテンプレートを削除するため、まず全取得
	const q = query(collection(db, 'weekly_templates'), where('userId', '==', userId));
	const snapshot = await getDocs(q);
	snapshot.docs.forEach((d) => {
		batch.delete(d.ref);
	});

	// 新しいテンプレートを保存
	templates.forEach((t) => {
		// ドキュメントIDを一意にするため `userId_dayOfWeek_index` またはランダムID
		const docRef = doc(collection(db, 'weekly_templates'));
		batch.set(docRef, {
			userId,
			dayOfWeek: Number(t.dayOfWeek),
			type: t.type,
			startTime: t.startTime,
			endTime: t.endTime,
			updatedAt: Timestamp.now()
		});
	});

	await batch.commit();
}

/**
 * 曜日ごとの時間割（テンプレート）を取得する
 */
export async function getWeeklyTemplates(userId: string): Promise<WeeklyTemplate[]> {
	const q = query(collection(db, 'weekly_templates'), where('userId', '==', userId));
	const snapshot = await getDocs(q);

	return snapshot.docs.map((d) => {
		const data = d.data();
		return {
			dayOfWeek: Number(data.dayOfWeek),
			type: data.type,
			startTime: data.startTime,
			endTime: data.endTime
		};
	});
}

/**
 * YYYY-MM-DD 形式の文字列を、タイムゾーンの影響を受けずにローカル日付として安全にパースする
 */
export function parseLocalDate(dateStr: string): Date {
	const parts = dateStr.split('-');
	return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

/**
 * 対象月の1日〜月末までのカレンダーに対応した仮の希望リスト（初期表示用）をマッピングする
 * すでにFirestoreに保存されている希望データがあればそれを優先する
 */
export async function generateMonthlyWishes(
	userId: string,
	year: number,
	month: number, // 1-12
	weeklyTemplates: WeeklyTemplate[]
): Promise<Wish[]> {
	// 月の初日と末日を算出
	const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
	const lastDay = new Date(year, month, 0).getDate();
	const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

	// 1. すでにFirestoreに保存されている希望データを取得
	const wishesRef = collection(db, 'wishes');
	// wishesのドキュメントIDは `userId_date` とすることで直接取得も可能だが、
	// 範囲取得のためにクエリを使用
	const q = query(
		wishesRef,
		where('userId', '==', userId),
		where('date', '>=', startDateStr),
		where('date', '<=', endDateStr)
	);
	const snapshot = await getDocs(q);
	const existingWishesMap = new Map<string, Wish>();

	snapshot.docs.forEach((d) => {
		const data = d.data();
		existingWishesMap.set(data.date, {
			date: data.date,
			type: data.type,
			startTime: data.startTime || '',
			endTime: data.endTime || '',
			isOverridden: data.isOverridden || false,
			isSubmitted: data.isSubmitted || false
		});
	});

	// 2. 曜日テンプレートをマップ化（dayOfWeek -> templates）
	const templateMap = new Map<number, WeeklyTemplate[]>();
	weeklyTemplates.forEach((t) => {
		const dayOfWeekKey = Number(t.dayOfWeek);
		if (!templateMap.has(dayOfWeekKey)) {
			templateMap.set(dayOfWeekKey, []);
		}
		templateMap.get(dayOfWeekKey)!.push(t);
	});

	// 3. 1日から月末までループしてマッピング
	const wishes: Wish[] = [];
	for (let day = 1; day <= lastDay; day++) {
		const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

		// 既存の保存データがあり、かつ個別上書きされている場合は最優先
		if (existingWishesMap.has(dateStr)) {
			const extWish = existingWishesMap.get(dateStr)!;
			if (extWish.isOverridden) {
				// もし上書きフラグがtrueでも、値がデフォルトの'free'かつ営業時間内の場合は、
				// テンプレートが存在すればテンプレート適用を優先するため、ここではcontinueせず下に進める
				const jsDate = new Date(year, month - 1, day);
				const dayOfWeek = jsDate.getDay();
				const dayTemplates = templateMap.get(dayOfWeek) || [];

				const isDefaultFree =
					extWish.type === 'free' &&
					(extWish.startTime === '09:45' || !extWish.startTime) &&
					(extWish.endTime === '20:15' || !extWish.endTime);

				if (isDefaultFree && dayTemplates.length > 0) {
					// continueせずにテンプレート適用処理に進む
				} else {
					wishes.push(extWish);
					continue;
				}
			}
		}

		// テンプレートまたはデフォルトから生成 (既存の未上書きデータがある場合はその提出状態を引継ぎ)
		const jsDate = new Date(year, month - 1, day);
		const dayOfWeek = jsDate.getDay();
		const dayTemplates = templateMap.get(dayOfWeek) || [];
		const extWish = existingWishesMap.get(dateStr);
		const isSubmitted = extWish ? extWish.isSubmitted : false;

		if (dayTemplates.length > 0) {
			// 簡易化のため最初のテンプレートを適用（複数ある場合はロジック追加可能）
			const primaryTemplate = dayTemplates[0];
			wishes.push({
				date: dateStr,
				type: primaryTemplate.type,
				startTime: primaryTemplate.startTime,
				endTime: primaryTemplate.endTime,
				isOverridden: false,
				isSubmitted
			});
		} else {
			// テンプレートがない日は「終日可(free)」として初期化
			wishes.push({
				date: dateStr,
				type: 'free',
				startTime: '09:45', // デフォルト営業時間開始
				endTime: '20:15', // デフォルト営業時間終了
				isOverridden: false,
				isSubmitted
			});
		}
	}

	return wishes;
}

/**
 * スタッフが特定の希望を保存（セット・更新）する
 * テンプレートと比較して上書きされた場合は `isOverridden: true` を付与
 */
export async function saveWish(
	userId: string,
	wish: Wish,
	weeklyTemplates: WeeklyTemplate[]
): Promise<void> {
	const docId = `${userId}_${wish.date}`;
	const docRef = doc(db, 'wishes', docId);

	// テンプレートと比較して上書きフラグを決定する
	const jsDate = parseLocalDate(wish.date);
	const dayOfWeek = jsDate.getDay();
	const dayTemplates = weeklyTemplates.filter((t) => Number(t.dayOfWeek) === dayOfWeek);

	let isOverridden = true;

	if (dayTemplates.length > 0) {
		const template = dayTemplates[0];
		// タイプ、開始、終了時間が一致していれば上書きされていないとみなす
		if (
			wish.type === template.type &&
			wish.startTime === template.startTime &&
			wish.endTime === template.endTime
		) {
			isOverridden = false;
		}
	} else {
		// テンプレートがない日は、デフォルトの 'free' かつデフォルト時間なら上書きなし
		if (wish.type === 'free' && wish.startTime === '09:45' && wish.endTime === '20:15') {
			isOverridden = false;
		}
	}

	await setDoc(
		docRef,
		{
			userId,
			date: wish.date,
			type: wish.type,
			startTime: wish.startTime,
			endTime: wish.endTime,
			isOverridden,
			isSubmitted: wish.isSubmitted,
			updatedAt: Timestamp.now()
		},
		{ merge: true }
	);
}

/**
 * 締め切りおよびロックのハイブリッド判定
 * @returns 編集がロックされている（disabledであるべき）場合は true
 */
export async function checkIsLocked(
	userId: string,
	systemSettings: SystemSettings | null,
	userIsUnlocked: boolean = false
): Promise<boolean> {
	if (!systemSettings) return false;

	// 1. 管理者による手動ロック
	if (systemSettings.isLocked) {
		// 個別解除されている場合はロックをバイパス
		return !userIsUnlocked;
	}

	// 2. 締め切り時刻の超過判定
	if (systemSettings.deadline) {
		const now = Timestamp.now();
		if (now.toMillis() > systemSettings.deadline.toMillis()) {
			// 締め切りを過ぎていても、個別解除されている場合はロックをバイパス
			return !userIsUnlocked;
		}
	}

	return false;
}

/**
 * 対象月のシフト希望を最終提出し、submittalsコレクションにステータスを保存する
 * また、その月の全wishesドキュメントのisSubmittedをtrueに一括更新する
 */
export async function submitMonthlyWishes(
	userId: string,
	year: number,
	month: number,
	wishes: Wish[]
): Promise<void> {
	const batch = writeBatch(db);

	// 1. submittals コレクションに提出済みステータスを保存
	const submittalDocId = `${userId}_${year}_${String(month).padStart(2, '0')}`;
	const submittalRef = doc(db, 'submittals', submittalDocId);
	batch.set(submittalRef, {
		userId,
		year,
		month,
		isSubmitted: true,
		submittedAt: Timestamp.now()
	});

	// 2. wishes コレクション内の各希望ドキュメントの isSubmitted を true に更新して保存
	wishes.forEach((w) => {
		const docId = `${userId}_${w.date}`;
		const docRef = doc(db, 'wishes', docId);
		batch.set(
			docRef,
			{
				userId,
				date: w.date,
				type: w.type,
				startTime: w.startTime,
				endTime: w.endTime,
				isOverridden: w.isOverridden,
				isSubmitted: true,
				updatedAt: Timestamp.now()
			},
			{ merge: true }
		);
	});

	await batch.commit();
}

/**
 * 対象月のシフト希望提出ステータスを取得する
 */
export async function getSubmitStatus(
	userId: string,
	year: number,
	month: number
): Promise<boolean> {
	try {
		const submittalDocId = `${userId}_${year}_${String(month).padStart(2, '0')}`;
		const docRef = doc(db, 'submittals', submittalDocId);
		const snap = await getDoc(docRef);
		if (snap.exists()) {
			const data = snap.data();
			return data.isSubmitted === true;
		}
	} catch (error: any) {
		if (error.message?.includes('offline') || error.code?.includes('offline')) {
			console.warn(
				'[Offline] Submit status check fell back to false (cache/offline):',
				error.message
			);
		} else {
			console.error('Error getting submit status:', error);
		}
	}
	return false;
}

import type { DailyShift, Staff } from './autoShiftService';

/**
 * 確定シフトを Firestore (confirmed_shifts コレクション) に保存する
 */
export async function saveConfirmedShift(dailyShift: DailyShift): Promise<void> {
	const docRef = doc(db, 'confirmed_shifts', dailyShift.date);
	await setDoc(docRef, {
		date: dailyShift.date,
		slots: dailyShift.slots,
		updatedAt: Timestamp.now()
	});
}

/**
 * 確定シフトを Firestore から取得する
 */
export async function getConfirmedShift(date: string): Promise<DailyShift | null> {
	const docRef = doc(db, 'confirmed_shifts', date);
	const snap = await getDoc(docRef);
	if (snap.exists()) {
		const data = snap.data();
		return {
			date: data.date,
			slots: data.slots
		};
	}
	return null;
}

/**
 * 対象月のすべての確定シフトを Firestore から一括取得する
 */
export async function getMonthlyConfirmedShifts(
	year: number,
	month: number
): Promise<DailyShift[]> {
	const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
	const lastDay = new Date(year, month, 0).getDate();
	const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

	const q = query(
		collection(db, 'confirmed_shifts'),
		where('date', '>=', startDateStr),
		where('date', '<=', endDateStr)
	);
	const snapshot = await getDocs(q);
	return snapshot.docs.map((d) => {
		const data = d.data();
		return {
			date: data.date,
			slots: data.slots
		};
	});
}

/**
 * 確定シフトデータを Notion にバックグラウンドで自動同期する（保険・データ破損対策の完全実装）
 */
export async function backupToNotion(dailyShift: DailyShift): Promise<boolean> {
	console.log(`[Notion Backup Triggered] Date: ${dailyShift.date}`);
	try {
		// 1. タイムライン上の slots から、その日勤務するユニークな staffId を抽出
		const uniqueStaffIds = new Set<string>();
		const staffNameMap = new Map<string, string>();

		Object.values(dailyShift.slots).forEach((assignments) => {
			assignments.forEach((assign) => {
				if (assign.staffId) {
					uniqueStaffIds.add(assign.staffId);
					if (assign.staffName) {
						staffNameMap.set(assign.staffId, assign.staffName);
					}
				}
			});
		});

		const staffIdList = Array.from(uniqueStaffIds);
		if (staffIdList.length === 0) {
			console.log(
				`[Notion Backup] No assignments on ${dailyShift.date}. Clearing Notion database entries for this date.`
			);
			const response = await fetch('/api/notion/confirmed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ date: dailyShift.date, records: [] })
			});
			return response.ok;
		}

		// 2. Firestore の users コレクションから各スタッフの `notion_person_id` と `uid` を並行取得
		const staffDocs = await Promise.all(
			staffIdList.map(async (staffId) => {
				try {
					const userDocRef = doc(db, 'users', staffId);
					const snap = await getDoc(userDocRef);
					if (snap.exists()) {
						const data = snap.data();
						return {
							staffId,
							name: data.name || '',
							notion_person_id: data.notion_person_id || null,
							uid: data.uid || staffId
						};
					}
				} catch (e) {
					console.warn(`[Notion Backup] Failed to fetch Firestore user details for ${staffId}:`, e);
				}
				return {
					staffId,
					name: '',
					notion_person_id: null,
					uid: staffId
				};
			})
		);

		// 3. 勤務スロットから、各スタッフの「開始時間」「終了時間」および勤務「エリア」を自動集計
		const records = staffDocs.map((doc) => {
			// 当該スタッフがアサインされている時間スロットをソートして取得
			const workingSlots = Object.entries(dailyShift.slots)
				.filter(([_, list]) => list.some((a) => a.staffId === doc.staffId))
				.map(([time]) => time)
				.sort((a, b) => {
					const [ah, am] = a.split(':').map(Number);
					const [bh, bm] = b.split(':').map(Number);
					return ah * 60 + am - (bh * 60 + bm);
				});

			let startTime = '';
			let endTime = '';
			let areas: string[] = [];

			if (workingSlots.length > 0) {
				startTime = workingSlots[0];

				// 終了時間は最終スロットの時刻に15分足した値
				const lastSlot = workingSlots[workingSlots.length - 1];
				const [h, m] = lastSlot.split(':').map(Number);
				let endM = m + 15;
				let endH = h;
				if (endM >= 60) {
					endM -= 60;
					endH += 1;
				}
				endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

				// 割り当てられたエリアを取得
				const uniqueAreas = new Set<string>();
				Object.values(dailyShift.slots).forEach((list) => {
					list.forEach((assign) => {
						if (assign.staffId === doc.staffId) {
							uniqueAreas.add(assign.area);
						}
					});
				});
				areas = Array.from(uniqueAreas);
			}

			return {
				staffId: doc.staffId,
				uid: doc.uid || doc.staffId,
				name: doc.name || staffNameMap.get(doc.staffId) || '不明',
				notion_person_id: doc.notion_person_id || null,
				startTime,
				endTime,
				areas
			};
		});

		// 4. エンドポイント /api/notion/confirmed にPOST送信
		const response = await fetch('/api/notion/confirmed', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				date: dailyShift.date,
				records
			})
		});

		if (!response.ok) {
			const errData = await response.json().catch(() => ({}));
			console.warn(
				'[Notion Confirmed Backup Warning] Notion sync endpoint returned non-ok:',
				response.status,
				errData.error || ''
			);
			return false;
		}

		const resData = await response.json();
		if (resData.success) {
			console.log(
				`[Notion Confirmed Backup Success] Synchronized ${resData.count} records to Notion.`
			);
			return true;
		} else {
			console.warn(
				'[Notion Confirmed Backup Warning] Notion sync failed in server handler:',
				resData.error
			);
			return false;
		}
	} catch (err) {
		console.error('[Notion Backup Failed] Insurance synchronization failed:', err);
		return false;
	}
}

/**
 * 希望シフト提出時に、自動的に Notion データベースへバックグラウンドでバックアップする同期トリガー
 */
export async function backupWishesToNotion(
	userId: string,
	year: number,
	month: number,
	wishes: Wish[]
): Promise<boolean> {
	console.log(`[Notion Wishes Backup Triggered] User: ${userId}, Target: ${year}-${month}`);
	try {
		const response = await fetch('/api/notion/wishes', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ userId, year, month, wishes })
		});

		if (!response.ok) {
			const errData = await response.json().catch(() => ({}));
			console.warn(
				'[Notion Wishes Backup Warning] Notion sync returned non-ok status:',
				response.status,
				errData.error || ''
			);
			return false;
		}

		const resData = await response.json();
		if (resData.success) {
			console.log(
				`[Notion Wishes Backup Success] Automatically synced ${resData.count} wishes to Notion.`
			);
			return true;
		} else {
			console.warn(
				'[Notion Wishes Backup Warning] Notion sync failed in server handler:',
				resData.error
			);
			return false;
		}
	} catch (err) {
		console.warn(
			'[Notion Wishes Backup Warning] Failed to fetch Notion sync API endpoint (might be offline or server not ready):',
			err
		);
		return false;
	}
}

/**
 * 将来的に Notion API で一括エクスポートしやすいよう、日付・UIDごとに綺麗にパースして保持する JSON Mock 関数
 */
export function exportWishesToJSON(
	wishes: Wish[],
	userId: string,
	notionDatabaseId: string
): string {
	const exportData = wishes.map((w) => {
		return {
			notion_database_id: notionDatabaseId,
			properties: {
				スタッフID: {
					type: 'title',
					title: [{ type: 'text', text: { content: userId } }]
				},
				日付: {
					type: 'date',
					date: { start: w.date }
				},
				希望区分: {
					type: 'select',
					select: { name: w.type === 'specific' ? '特定時間' : w.type === 'ng' ? 'NG' : 'おまかせ' }
				},
				開始時間: {
					type: 'rich_text',
					rich_text: [{ type: 'text', text: { content: w.startTime || '' } }]
				},
				終了時間: {
					type: 'rich_text',
					rich_text: [{ type: 'text', text: { content: w.endTime || '' } }]
				},
				個別上書き: {
					type: 'checkbox',
					checkbox: w.isOverridden
				},
				更新日時: {
					type: 'date',
					date: { start: new Date().toISOString() }
				}
			}
		};
	});

	return JSON.stringify(exportData, null, 2);
}

/**
 * スタッフ（ユーザーデータ）を Firestore の users コレクションに保存・更新する
 */
export async function saveStaffDetails(staff: Staff): Promise<void> {
	const docRef = doc(db, 'users', staff.id);
	await setDoc(
		docRef,
		{
			id: staff.id,
			name: staff.name,
			role: staff.role,
			tags: staff.tags || [],
			age_group: staff.age_group || 'adult',
			targetIncomeMin: staff.targetIncomeMin || 0,
			targetIncomeMax: staff.targetIncomeMax || 0,
			target_monthly_income: staff.target_monthly_income || 0,
			max_monthly_income: staff.max_monthly_income || 0,
			hourlyWage: staff.hourlyWage || 0,
			hourly_wage: staff.hourly_wage || 0,
			notion_person_id: staff.notion_person_id || '',
			uid: staff.uid || staff.id,
			is_trainee: !!(staff.is_trainee || staff.isTrainee),
			isTrainee: !!(staff.is_trainee || staff.isTrainee),
			isLateSubmission: !!staff.isLateSubmission,
			updatedAt: Timestamp.now()
		},
		{ merge: true }
	);
}

/**
 * 全スタッフ（ユーザーデータ）を取得する。
 * もし Firestore の users コレクションが空の場合は、シードデータ（デフォルト）を自動保存して返す
 */
export async function getStaffDetails(fallbackStaffs?: Staff[]): Promise<Staff[]> {
	try {
		const q = collection(db, 'users');
		const snapshot = await getDocs(q);

		if (snapshot.empty && fallbackStaffs && fallbackStaffs.length > 0) {
			// データベースが空の場合はデフォルト値をシード保存する
			for (const s of fallbackStaffs) {
				await saveStaffDetails(s);
			}
			return fallbackStaffs;
		}

		return snapshot.docs.map((d) => {
			const data = d.data();
			return {
				id: data.id || d.id,
				name: data.name || '',
				role: data.role || 'adult',
				tags: data.tags || [],
				age_group: data.age_group || 'adult',
				targetIncomeMin:
					data.targetIncomeMin !== undefined &&
					data.targetIncomeMin !== null &&
					data.targetIncomeMin > 0
						? data.targetIncomeMin
						: 40000,
				targetIncomeMax:
					data.targetIncomeMax !== undefined &&
					data.targetIncomeMax !== null &&
					data.targetIncomeMax > 0
						? data.targetIncomeMax
						: 40000,
				target_monthly_income: data.target_monthly_income || 0,
				max_monthly_income: data.max_monthly_income || 0,
				hourlyWage: data.hourlyWage || 0,
				hourly_wage: data.hourly_wage || 0,
				notion_person_id: data.notion_person_id || '',
				uid: data.uid || data.id || d.id,
				is_trainee: !!(data.is_trainee || data.isTrainee),
				isTrainee: !!(data.is_trainee || data.isTrainee),
				isLateSubmission: !!data.isLateSubmission
			};
		});
	} catch (err) {
		console.warn('Firestore getStaffDetails query skipped or failed, returning fallbacks:', err);
		return fallbackStaffs || [];
	}
}

/**
 * 特定の日付の全スタッフの希望（wishes）を Firestore から取得する
 */
export async function getDailyWishes(dateStr: string): Promise<{ [staffId: string]: Wish }> {
	try {
		const q = query(collection(db, 'wishes'), where('date', '==', dateStr));
		const snapshot = await getDocs(q);
		const wishesMap: { [staffId: string]: Wish } = {};
		snapshot.docs.forEach((d) => {
			const data = d.data();
			if (data.userId) {
				wishesMap[data.userId] = {
					date: data.date,
					type: data.type,
					startTime: data.startTime || '',
					endTime: data.endTime || '',
					isOverridden: data.isOverridden || false,
					isSubmitted: data.isSubmitted || false
				};
			}
		});
		return wishesMap;
	} catch (err) {
		console.warn(`[shiftService] Failed to load wishes for date ${dateStr}:`, err);
		return {};
	}
}

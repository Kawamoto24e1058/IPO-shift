import { type Wish } from './shiftService';

export interface Staff {
	id: string;
	name: string;
	role: 'employee' | 'staff' | 'adult' | 'minor';
	/** 担当可能エリアタグ: 'CW'=コワーキング, 'FS'=フリースクール, 'UNICES' */
	tags?: string[];
	/** 年齢区分: 'adult'=成人, 'minor'=未成年 (未成年ペア禁止判定に使用) */
	age_group?: 'adult' | 'minor';
	targetIncomeMin?: number; // 希望月収（下限）
	targetIncomeMax?: number; // 希望月収（上限）
	target_monthly_income?: number; // 目標希望月収
	max_monthly_income?: number; // 絶対上限月収
	hourlyWage?: number; // 時給
	hourly_wage?: number; // 時給
	notion_person_id?: string; // Notionユーザー一意のUUID (Person属性マッピング用)
	uid?: string; // アプリ内ユーザーID
	is_trainee?: boolean;
	isTrainee?: boolean;
	isLateSubmission?: boolean;
}

export interface UnicesEvent {
	date: string; // "YYYY-MM-DD"
	startTime: string; // "HH:MM"
	endTime: string; // "HH:MM"
}

export interface ShiftAssignment {
	staffId: string;
	staffName: string;
	role: 'employee' | 'adult' | 'minor';
	/** エリア: cafe=コワーキング, fs=フリースクール, unices=UNICES */
	area: 'cafe' | 'fs' | 'unices';
	isRarePinned?: boolean; // 激レア自動ピン留めフラグ (未成年ペア警告などにも流用)
}

export interface DailyShift {
	date: string;
	// キー: "09:45", "10:00", ..., "20:00" (15分刻み)
	slots: { [time: string]: ShiftAssignment[] };
	unassignedStaffs?: { staffId: string; staffName: string; role: 'employee' | 'adult' | 'minor' }[]; // あぶれた希望提出者
}

export interface ShiftAlert {
	time?: string; // 特定の時間帯に起因する場合はその時間、終日なら undefined
	type: 'minor_opening_closing' | 'one_man' | 'minor_overtime' | 'no_employee';
	message: string;
	severity: 'warning' | 'error';
}

// 営業時間のタイムスロット（15分刻み、09:45から20:00まで＝実質20:15終了）
export const TIME_SLOTS = [
	'09:45',
	'10:00',
	'10:15',
	'10:30',
	'10:45',
	'11:00',
	'11:15',
	'11:30',
	'11:45',
	'12:00',
	'12:15',
	'12:30',
	'12:45',
	'13:00',
	'13:15',
	'13:30',
	'13:45',
	'14:00',
	'14:15',
	'14:30',
	'14:45',
	'15:00',
	'15:15',
	'15:30',
	'15:45',
	'16:00',
	'16:15',
	'16:30',
	'16:45',
	'17:00',
	'17:15',
	'17:30',
	'17:45',
	'18:00',
	'18:15',
	'18:30',
	'18:45',
	'19:00',
	'19:15',
	'19:30',
	'19:45',
	'20:00'
];

/**
 * 時間文字列 ("HH:MM") を分に変換
 */
function timeToMinutes(timeStr: string): number {
	const [h, m] = timeStr.split(':').map(Number);
	return h * 60 + m;
}

/**
 * 特定のタイムスロット ("HH:MM") が、指定された時間範囲内にあるか判定
 */
function isSlotInInterval(slot: string, start: string, end: string): boolean {
	const slotMin = timeToMinutes(slot);
	const startMin = timeToMinutes(start);
	const endMin = timeToMinutes(end);
	return slotMin >= startMin && slotMin < endMin;
}

/**
 * スタッフの希望（wishes）から、特定スロットで勤務可能か判定
 */
export function isStaffAvailable(wish: Wish | undefined, slot: string): boolean {
	if (!wish) return false;
	if (wish.type === 'ng') return false;
	if (wish.type === 'free') return true; // 終日可

	// 特定時間のみ (specific)
	return isSlotInInterval(slot, wish.startTime, wish.endTime);
}

/**
 * シフト自動生成ロジック
 * @param date 対象日 ("YYYY-MM-DD")
 * @param staffs スタッフ全員のリスト
 * @param wishesMap スタッフIDごとのその日の希望 (Wish)
 * @param unicesEvents その日のUNICES開催情報リスト
 * @param options 追加の考慮設定（当月の既アサイン時間、希望金額の考慮の重み）
 */
/**
 * 対象日の直近の連勤数（targetDateStrの前日より連続して何日間勤務しているか）を計算する
 */
function getConsecutiveWorkingDays(
	staffId: string,
	targetDateStr: string,
	monthlyShifts: DailyShift[]
): number {
	if (!monthlyShifts || monthlyShifts.length === 0) return 0;

	let count = 0;
	const targetDate = new Date(targetDateStr);

	// 最大連勤数は念のため31日までに制限して無限ループを防止
	for (let i = 1; i <= 31; i++) {
		const prevDate = new Date(targetDate);
		prevDate.setDate(targetDate.getDate() - i);

		const y = prevDate.getFullYear();
		const m = String(prevDate.getMonth() + 1).padStart(2, '0');
		const d = String(prevDate.getDate()).padStart(2, '0');
		const checkDateStr = `${y}-${m}-${d}`;

		// monthlyShifts から前日のアサインを確認
		const prevShift = monthlyShifts.find((s) => s.date === checkDateStr);
		if (!prevShift) {
			break;
		}

		// 前日にアサインされていたかチェック（少なくとも1つのスロットに入っているか）
		const worked = Object.values(prevShift.slots).some((assignments) =>
			assignments.some((a) => a.staffId === staffId)
		);

		if (worked) {
			count++;
		} else {
			break;
		}
	}

	return count;
}

/**
 * シフト自動生成ロジック（5段階の優先度＆最低1名成人/社員アサインの組み合わせ最適化搭載）
 * @param date 対象日 ("YYYY-MM-DD")
 * @param staffs スタッフ全員のリスト
 * @param wishesMap スタッフIDごとのその日の希望 (Wish)
 * @param unicesEvents その日のUNICES開催情報リスト
 * @param options 追加の考慮設定（当月の既アサイン時間、希望金額の考慮の重み、当月確定シフト履歴）
 */
/**
 * 曜日を安全に数値（0-6）に変換する
 */
export function parseDayOfWeek(val: any): number | null {
	if (val === undefined || val === null) return null;
	const num = Number(val);
	if (!isNaN(num) && num >= 0 && num <= 6) return num;

	if (typeof val === 'string') {
		const clean = val.toLowerCase().trim();
		const engIdx = [
			'sunday',
			'monday',
			'tuesday',
			'wednesday',
			'thursday',
			'friday',
			'saturday'
		].indexOf(clean);
		if (engIdx !== -1) return engIdx;

		const shortEngIdx = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(clean);
		if (shortEngIdx !== -1) return shortEngIdx;

		const jpIdx = ['日', '月', '火', '水', '木', '金', '土'].indexOf(clean.replace(/曜日/g, ''));
		if (jpIdx !== -1) return jpIdx;
	}
	return null;
}

export function normalizeWish(wish: any): {
	date: string;
	type: 'ng' | 'specific' | 'free';
	startTime: string;
	endTime: string;
	isSubmitted: boolean;
	isOverridden: boolean;
} {
	if (!wish) {
		return {
			date: '',
			type: 'free',
			startTime: '09:45',
			endTime: '20:15',
			isSubmitted: false,
			isOverridden: false
		};
	}

	const typeStr = String(wish.type || '')
		.trim()
		.toLowerCase();
	const startStr = String(wish.startTime || '')
		.trim()
		.toLowerCase();
	const endStr = String(wish.endTime || '')
		.trim()
		.toLowerCase();
	const isSubmitted = wish.isSubmitted !== undefined ? !!wish.isSubmitted : true;
	const isOverridden = !!wish.isOverridden;
	const date = wish.date || '';

	const isFree =
		typeStr === 'free' ||
		typeStr === 'おまかせ' ||
		typeStr === 'お任せ' ||
		typeStr === 'フリー' ||
		typeStr === '終日' ||
		typeStr === '終日可' ||
		startStr.includes('おまかせ') ||
		endStr.includes('おまかせ') ||
		startStr === '' ||
		endStr === '';

	if (isFree) {
		return { date, type: 'free', startTime: '09:45', endTime: '20:15', isSubmitted, isOverridden };
	}

	if (typeStr === 'ng' || typeStr === '休み' || typeStr === '不可' || typeStr === 'off') {
		return { date, type: 'ng', startTime: '', endTime: '', isSubmitted, isOverridden };
	}

	// 固定枠IDの処理
	if (startStr === 'frame1') {
		return {
			date,
			type: 'specific',
			startTime: '09:45',
			endTime: '15:00',
			isSubmitted,
			isOverridden
		};
	}
	if (startStr === 'frame2') {
		return {
			date,
			type: 'specific',
			startTime: '15:00',
			endTime: '20:15',
			isSubmitted,
			isOverridden
		};
	}

	return {
		date,
		type: 'specific',
		startTime: wish.startTime || '09:45',
		endTime: wish.endTime || '20:15',
		isSubmitted,
		isOverridden
	};
}

/**
 * シフト自動生成ロジック（5段階の優先度＆最低1名成人/社員アサインの組み合わせ最適化搭載）
 * @param date 対象日 ("YYYY-MM-DD")
 * @param staffs スタッフ全員のリスト
 * @param wishesMap スタッフIDごとのその日の希望 (Wish)
 * @param unicesEvents その日のUNICES開催情報リスト
 * @param options 追加の考慮設定（当月の既アサイン時間、希望金額の考慮の重み、当月確定シフト履歴）
 */
export function generateDailyShift(
	date: string,
	staffs: Staff[],
	wishesMap: { [staffId: string]: Wish },
	unicesEvents: UnicesEvent[],
	options?: {
		accruedHours?: { [staffId: string]: number };
		considerIncomeWeight?: 'none' | 'low' | 'high';
		monthlyConfirmedShifts?: DailyShift[];
		priorityPool?: { [staffId: string]: number }; // あぶれ回数の追跡プール
	}
): DailyShift {
	const slots: { [time: string]: ShiftAssignment[] } = {};

	// 各タイムスロットの初期化
	TIME_SLOTS.forEach((slot) => {
		slots[slot] = [];
	});

	if (!staffs || staffs.length === 0) {
		return { date, slots, unassignedStaffs: [] };
	}

	const accruedHours = options?.accruedHours || {};
	const considerIncomeWeight = options?.considerIncomeWeight || 'none';
	const monthlyConfirmedShifts = options?.monthlyConfirmedShifts || [];
	const priorityPool = options?.priorityPool || {};

	const assignedSlotsCount: { [staffId: string]: number } = {};

	// wishesMapの標準化（おまかせ展開や安全デフォルト値保証）
	const normalizedWishesMap: { [staffId: string]: ReturnType<typeof normalizeWish> } = {};
	staffs.forEach((s) => {
		const rawWish = wishesMap[s.id];
		normalizedWishesMap[s.id] = normalizeWish(rawWish);
	});

	// その日に稼働可能（Wishesが ng 以外）なスタッフを抽出
	const availableStaffs = staffs.filter((s) => {
		const wish = normalizedWishesMap[s.id];
		return wish.type !== 'ng';
	});

	// 【動的ソート用ヘルパー関数】
	function getWishHours(wish: ReturnType<typeof normalizeWish>): number {
		if (wish.type === 'ng') return 0;
		if (wish.type === 'free') return 10.5; // 終日は 10.5時間
		const startMin = timeToMinutes(wish.startTime);
		const endMin = timeToMinutes(wish.endTime);
		return Math.max(0, (endMin - startMin) / 60);
	}

	// 1. 各スタッフの「目標月収差額（降順）」「連勤数（昇順）」で動的にソート
	const sortedStaffs = availableStaffs.map((s) => {
		const staffId = s.id;
		const currentHours = accruedHours[staffId] || 0;
		const wage =
			Number(s.hourlyWage || s.hourly_wage) ||
			(s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100);
		const currentIncome = currentHours * wage;

		// 目標月収の算出（目標下限と上限の平均、またはデフォルト40000円）
		const minVal = Number(s.targetIncomeMin);
		const maxVal = Number(s.target_monthly_income || s.targetIncomeMax);
		let targetIncome = 40000;
		if (!isNaN(minVal) && !isNaN(maxVal) && minVal > 0 && maxVal > 0) {
			targetIncome = (minVal + maxVal) / 2;
		} else if (!isNaN(maxVal) && maxVal > 0) {
			targetIncome = maxVal;
		} else if (!isNaN(minVal) && minVal > 0) {
			targetIncome = minVal;
		}

		const incomeGap = targetIncome - currentIncome;
		const consecutiveDays = getConsecutiveWorkingDays(s.id, date, monthlyConfirmedShifts);

		return {
			staff: s,
			incomeGap,
			consecutiveDays,
			currentIncome,
			wage
		};
	});

	// 並び替え: 差額が大きい順 ➔ 連勤数が少ない順
	sortedStaffs.sort((a, b) => {
		if (Math.abs(a.incomeGap - b.incomeGap) > 0.01) {
			return b.incomeGap - a.incomeGap; // 差額が大きい順 (降順)
		}
		return a.consecutiveDays - b.consecutiveDays; // 連勤数が少ない順 (昇順)
	});

	// 2. 目標金額（上限5万円 / targetIncomeMax）に達した、あるいは今日のシフトで超過するスタッフを強制スキップ
	const nonExcludedStaffs = sortedStaffs.filter((item) => {
		const s = item.staff;
		const maxIncomeCap =
			s.role === 'employee'
				? Number(s.target_monthly_income || s.targetIncomeMax) || 250000
				: Math.min(50000, Number(s.target_monthly_income || s.targetIncomeMax) || 50000);

		// すでに上限に達しているか
		if (item.currentIncome >= maxIncomeCap) {
			return false;
		}

		// 今日の予定シフトを入れることで上限を超過するかチェック
		const wish = normalizedWishesMap[s.id];
		const estimatedDailyHours = getWishHours(wish);
		const estimatedDailyIncome = estimatedDailyHours * item.wage;
		if (item.currentIncome + estimatedDailyIncome > maxIncomeCap) {
			return false; // 超過する場合は強制スキップ
		}

		return true;
	});

	// アサイン候補の選定（全員スキップされてしまった場合のフォールバックセーフティ）
	let candidateItems = nonExcludedStaffs;
	if (candidateItems.length === 0) {
		candidateItems = sortedStaffs; // 店舗営業破綻防止用の緩和
	}

	// カフェスタッフの選定 (最高優先度のStaff1と、未成年制約を満たすStaff2)
	let staff1: Staff | null = null;
	let staff2: Staff | null = null;

	if (candidateItems.length > 0) {
		staff1 = candidateItems[0].staff;

		// Staff2の選出 (Staff1と異なり、未成年ペアを形成しないスタッフ)
		for (let i = 1; i < candidateItems.length; i++) {
			const s = candidateItems[i].staff;
			if ((staff1.age_group || staff1.role) === 'minor' && (s.age_group || s.role) === 'minor') {
				continue;
			}
			staff2 = s;
			break;
		}
	}

	// --- 2. 「おまかせ」スタッフの動的な時間変形（前半・後半のパズル隙間埋め） ---
	const cafeAssignments: { staff: Staff; startTime: string; endTime: string }[] = [];

	if (staff1 && !staff2) {
		const s = staff1;
		const wish = normalizedWishesMap[s.id];
		let startTime = wish.startTime;
		let endTime = wish.endTime;

		// 未成年単独かつおまかせの場合は8時間制限 (17:45終了)
		if ((s.age_group || s.role) === 'minor' && wish.type === 'free') {
			endTime = '17:45';
		}
		cafeAssignments.push({ staff: s, startTime, endTime });
	} else if (staff1 && staff2) {
		const sA = staff1;
		const sB = staff2;
		const wA = normalizedWishesMap[sA.id];
		const wB = normalizedWishesMap[sB.id];

		if (wA.type === 'free' && wB.type === 'free') {
			// 2人とも「おまかせ」の場合 ➔ 前後半に二分割して営業時間を最適カバー
			cafeAssignments.push({ staff: sA, startTime: '09:45', endTime: '15:00' });
			cafeAssignments.push({ staff: sB, startTime: '15:00', endTime: '20:15' });
		} else if (wA.type === 'free' && wB.type === 'specific') {
			// 相方Bが特定時間 ➔ AはBのいない前後半の隙間に変形
			const bStartMin = timeToMinutes(wB.startTime);
			if (bStartMin >= 15 * 60) {
				cafeAssignments.push({ staff: sA, startTime: '09:45', endTime: '15:00' });
			} else {
				cafeAssignments.push({ staff: sA, startTime: '15:00', endTime: '20:15' });
			}
			cafeAssignments.push({ staff: sB, startTime: wB.startTime, endTime: wB.endTime });
		} else if (wA.type === 'specific' && wB.type === 'free') {
			// 相方Aが特定時間、Bがおまかせ
			const aStartMin = timeToMinutes(wA.startTime);
			cafeAssignments.push({ staff: sA, startTime: wA.startTime, endTime: wA.endTime });
			if (aStartMin >= 15 * 60) {
				cafeAssignments.push({ staff: sB, startTime: '09:45', endTime: '15:00' });
			} else {
				cafeAssignments.push({ staff: sB, startTime: '15:00', endTime: '20:15' });
			}
		} else {
			// 2人とも「特定時間」➔ 各自の希望時間通りに配置
			cafeAssignments.push({ staff: sA, startTime: wA.startTime, endTime: wA.endTime });
			cafeAssignments.push({ staff: sB, startTime: wB.startTime, endTime: wB.endTime });
		}
	}

	// カフェのアサインをスロットに流し込み
	const cafeAssignedIds = new Set<string>();
	cafeAssignments.forEach((assign) => {
		cafeAssignedIds.add(assign.staff.id);
		TIME_SLOTS.forEach((slot) => {
			if (isSlotInInterval(slot, assign.startTime, assign.endTime)) {
				slots[slot].push({
					staffId: assign.staff.id,
					staffName: assign.staff.name,
					role:
						(assign.staff.age_group || assign.staff.role) === 'minor'
							? 'minor'
							: assign.staff.role === 'employee'
								? 'employee'
								: 'adult',
					area: 'cafe'
				});
				assignedSlotsCount[assign.staff.id] = (assignedSlotsCount[assign.staff.id] || 0) + 1;
			}
		});
	});

	// --- 3. 🌐 UNICESエリアの独立配置（プラス1名） ---
	const hasUnicesEvent = unicesEvents.length > 0;
	let unicesStaff: Staff | null = null;

	if (hasUnicesEvent) {
		const event = unicesEvents[0];

		// カフェに選ばれなかったメンバーで、UNICESイベント時間に稼働可能なスタッフを抽出
		const unicesCandidates = staffs.filter((s) => {
			if (cafeAssignedIds.has(s.id)) return false; // カフェ配置者は除外

			const currentHours = accruedHours[s.id] || 0;
			const wage =
				Number(s.hourlyWage || s.hourly_wage) ||
				(s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100);
			const currentIncome = currentHours * wage;
			const maxIncomeCap =
				s.role === 'employee'
					? Number(s.target_monthly_income || s.targetIncomeMax) || 250000
					: Math.min(50000, Number(s.target_monthly_income || s.targetIncomeMax) || 50000);

			if (currentIncome >= maxIncomeCap) return false;
			if ((s.age_group || s.role) === 'minor') return false; // UNICESは未成年不可

			const wish = normalizedWishesMap[s.id];
			if (wish.type === 'ng') return false;

			// イベントの時間帯すべてをカバーできること
			return (
				isSlotInInterval(event.startTime, wish.startTime, wish.endTime) &&
				isSlotInInterval(event.endTime, wish.startTime, wish.endTime)
			);
		});

		// UNICES候補も同様に、現在の確定給与が少ない順にソートして最優先で選定！
		const sortedUnicesCandidates = unicesCandidates.map((s) => {
			const currentHours = accruedHours[s.id] || 0;
			const wage =
				Number(s.hourlyWage || s.hourly_wage) ||
				(s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100);
			const currentIncome = currentHours * wage;

			const minVal = Number(s.targetIncomeMin);
			const maxVal = Number(s.target_monthly_income || s.targetIncomeMax);
			let targetIncome = 40000;
			if (!isNaN(minVal) && !isNaN(maxVal) && minVal > 0 && maxVal > 0) {
				targetIncome = (minVal + maxVal) / 2;
			} else if (!isNaN(maxVal) && maxVal > 0) {
				targetIncome = maxVal;
			} else if (!isNaN(minVal) && minVal > 0) {
				targetIncome = minVal;
			}

			const incomeGap = targetIncome - currentIncome;
			const consecutiveDays = getConsecutiveWorkingDays(s.id, date, monthlyConfirmedShifts);

			return {
				staff: s,
				incomeGap,
				consecutiveDays
			};
		});

		sortedUnicesCandidates.sort((a, b) => {
			if (Math.abs(a.incomeGap - b.incomeGap) > 0.01) {
				return b.incomeGap - a.incomeGap;
			}
			return a.consecutiveDays - b.consecutiveDays;
		});

		if (sortedUnicesCandidates.length > 0) {
			unicesStaff = sortedUnicesCandidates[0].staff;
			TIME_SLOTS.forEach((slot) => {
				if (isSlotInInterval(slot, event.startTime, event.endTime)) {
					slots[slot].push({
						staffId: unicesStaff!.id,
						staffName: unicesStaff!.name,
						role:
							(unicesStaff!.age_group || unicesStaff!.role) === 'minor'
								? 'minor'
								: unicesStaff!.role === 'employee'
									? 'employee'
									: 'adult',
						area: 'unices'
					});
					assignedSlotsCount[unicesStaff!.id] = (assignedSlotsCount[unicesStaff!.id] || 0) + 1;
				}
			});
		}
	}

	// --- 4. あぶれた希望提出者（あぶれメンバー）のストック ---
	const allAssignedIds = new Set<string>(cafeAssignedIds);
	if (unicesStaff) {
		allAssignedIds.add(unicesStaff.id);
	}

	const unassignedStaffs: {
		staffId: string;
		staffName: string;
		role: 'employee' | 'adult' | 'minor';
	}[] = [];

	staffs.forEach((s) => {
		if (allAssignedIds.has(s.id)) return;

		const wish = wishesMap[s.id];
		// その日「希望を自発的に出している人」、または「曜日設定がある人」であぶれたスタッフをストック
		if (wish && wish.type !== 'ng') {
			unassignedStaffs.push({
				staffId: s.id,
				staffName: s.name,
				role:
					(s.age_group || s.role) === 'minor'
						? 'minor'
						: s.role === 'employee'
							? 'employee'
							: 'adult'
			});
		}
	});

	return { date, slots, unassignedStaffs };
}

/**
 * リアルタイム・バリデーション（アラート判定）
 */
export function validateDailyShift(dailyShift: DailyShift, staffs: Staff[]): ShiftAlert[] {
	const alerts: ShiftAlert[] = [];
	const staffMap = new Map<string, Staff>();
	staffs.forEach((s) => staffMap.set(s.id, s));

	// 未成年の累積時間集計用 (1スロット15分 = 0.25時間)
	const minorWorkSlotsCount: { [staffId: string]: number } = {};

	// 社員が終日通して1人もいないかの判定用
	let hasAnyEmployee = false;

	// タイムスロットごとに走査
	TIME_SLOTS.forEach((slot) => {
		const assignments = dailyShift.slots[slot] || [];
		const totalStaffCount = assignments.length;

		// 条件A：09:45(開け) または 20:00(締め) に未成年しかいない
		if (slot === '09:45' && totalStaffCount > 0) {
			const allMinor = assignments.every((a) => a.role === 'minor');
			if (allMinor) {
				alerts.push({
					time: slot,
					type: 'minor_opening_closing',
					message: '開け作業 (09:45〜10:00) が未成年スタッフのみで構成されています。',
					severity: 'error'
				});
			}
		}

		if (slot === '20:00' && totalStaffCount > 0) {
			const allMinor = assignments.every((a) => a.role === 'minor');
			if (allMinor) {
				alerts.push({
					time: slot,
					type: 'minor_opening_closing',
					message: '締め作業 (20:00〜20:15) が未成年スタッフのみで構成されています。',
					severity: 'error'
				});
			}
		}

		// 条件B：スタッフの合計人数が1人（ワンオペ）の時間帯がある
		// 開け(09:45)はもともと1人体制が標準なので除外
		if (slot !== '09:45' && totalStaffCount === 1) {
			alerts.push({
				time: slot,
				type: 'one_man',
				message: `ワンオペ時間帯が発生しています (${slot}〜)。`,
				severity: 'warning'
			});
		}

		// 各スタッフの稼働時間をカウント
		assignments.forEach((assignment) => {
			if (assignment.role === 'minor') {
				minorWorkSlotsCount[assignment.staffId] =
					(minorWorkSlotsCount[assignment.staffId] || 0) + 1;
			}
			if (assignment.role === 'employee') {
				hasAnyEmployee = true;
			}
		});
	});

	// 条件C：同一の未成年スタッフの合計勤務時間が8時間を超えている
	// 8時間 = 32スロット (32 * 15分 = 480分)
	Object.keys(minorWorkSlotsCount).forEach((staffId) => {
		const slots = minorWorkSlotsCount[staffId];
		const hours = slots * 0.25;
		if (hours > 8) {
			const staff = staffMap.get(staffId);
			alerts.push({
				type: 'minor_overtime',
				message: `未成年スタッフ「${staff?.name || staffId}」の合計勤務時間が8時間を超えています (${hours}時間)。`,
				severity: 'error'
			});
		}
	});

	// 条件D：その日、社員（employee）が1人も配置されていない
	if (!hasAnyEmployee) {
		alerts.push({
			type: 'no_employee',
			message: '本日のシフトに社員 (employee) が1人も配置されていません。',
			severity: 'warning'
		});
	}

	return alerts;
}

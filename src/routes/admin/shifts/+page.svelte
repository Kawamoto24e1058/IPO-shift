<!-- src/routes/admin/shifts/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import {
		type Staff,
		type DailyShift,
		type ShiftAssignment,
		TIME_SLOTS,
		parseDayOfWeek,
		normalizeWish
	} from '$lib/services/autoShiftService';
	import {
		type Wish,
		getStaffDetails,
		saveStaffDetails,
		backupToNotion,
		getMonthlyConfirmedShifts,
		subscribeMonthlyConfirmedShifts,
		subscribeMonthlyWishes,
		saveConfirmedShiftsToLocalCache,
		loadConfirmedShiftsFromLocalCache,
		subscribePendingShiftRequests,
		updateShiftRequestStatus,
		type ShiftRequest
	} from '$lib/services/shiftService';
	import { runPureMathAutoShiftEngine } from '$lib/services/pureMathSolverEngine';
	import { authState } from '../../../lib/services/authService.svelte.ts';
	import {
		doc,
		collection,
		query,
		where,
		getDocs,
		writeBatch,
		Timestamp,
		getDoc,
		setDoc,
		type Unsubscribe
	} from 'firebase/firestore';
	import { db } from '$lib/firebase';

	// 1. 実務スタッフデータ（17名） — CW / FS / UNICESタグ付き（多様な希望条件・設定）
	let staffs = $state<Staff[]>([
		{
			id: 'staff_01',
			uid: 'staff_01',
			name: '川本(管理者)',
			role: 'employee',
			hourlyWage: 1200,
			hourly_wage: 1200,
			target_monthly_income: 50000,
			max_monthly_income: 80000,
			preferredDaysPerWeek: 3,
			dayPreferencePolicy: 'FIXED',
			tags: ['CW', 'FS', 'UNICES'],
			age_group: 'adult'
		},
		{
			id: 'staff_02',
			uid: 'staff_02',
			name: '佐藤',
			role: 'employee',
			hourlyWage: 1100,
			hourly_wage: 1100,
			target_monthly_income: 50000,
			max_monthly_income: 80000,
			preferredDaysPerWeek: 3,
			dayPreferencePolicy: 'ROTATING',
			tags: ['CW', 'FS'],
			age_group: 'adult'
		},
		{
			id: 'staff_03',
			uid: 'staff_03',
			name: '田中',
			role: 'staff',
			hourlyWage: 1000,
			hourly_wage: 1000,
			target_monthly_income: 45000,
			max_monthly_income: 70000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'ANY',
			tags: ['CW', 'FS'],
			age_group: 'adult'
		},
		{
			id: 'staff_04',
			uid: 'staff_04',
			name: '山本',
			role: 'staff',
			hourlyWage: 1000,
			hourly_wage: 1000,
			target_monthly_income: 40000,
			max_monthly_income: 70000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'FIXED',
			tags: ['CW', 'UNICES'],
			age_group: 'adult'
		},
		{
			id: 'staff_05',
			uid: 'staff_05',
			name: '鈴木',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 35000,
			max_monthly_income: 60000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ANY',
			tags: ['CW'],
			age_group: 'minor',
			is_trainee: true
		},
		{
			id: 'staff_06',
			uid: 'staff_06',
			name: '高橋',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 30000,
			max_monthly_income: 50000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ROTATING',
			tags: ['CW'],
			age_group: 'minor',
			isTrainee: true
		},
		{
			id: 'staff_07',
			uid: 'staff_07',
			name: '渡辺',
			role: 'staff',
			hourlyWage: 1000,
			hourly_wage: 1000,
			target_monthly_income: 40000,
			max_monthly_income: 70000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'ANY',
			tags: ['CW', 'FS'],
			age_group: 'adult'
		},
		{
			id: 'staff_08',
			uid: 'staff_08',
			name: '伊藤',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 35000,
			max_monthly_income: 60000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'FIXED',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_09',
			uid: 'staff_09',
			name: '中村',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 30000,
			max_monthly_income: 50000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ANY',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_10',
			uid: 'staff_10',
			name: '小林',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 40000,
			max_monthly_income: 70000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'ROTATING',
			tags: ['CW', 'UNICES'],
			age_group: 'adult'
		},
		{
			id: 'staff_11',
			uid: 'staff_11',
			name: '加藤',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 35000,
			max_monthly_income: 60000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ANY',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_12',
			uid: 'staff_12',
			name: '吉田',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 30000,
			max_monthly_income: 50000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'FIXED',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_13',
			uid: 'staff_13',
			name: '山田',
			role: 'staff',
			hourlyWage: 1000,
			hourly_wage: 1000,
			target_monthly_income: 40000,
			max_monthly_income: 70000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'ANY',
			tags: ['CW', 'FS', 'UNICES'],
			age_group: 'adult'
		},
		{
			id: 'staff_14',
			uid: 'staff_14',
			name: '佐々木',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 35000,
			max_monthly_income: 60000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ROTATING',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_15',
			uid: 'staff_15',
			name: '山口',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 30000,
			max_monthly_income: 50000,
			preferredDaysPerWeek: 2,
			dayPreferencePolicy: 'ANY',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_16',
			uid: 'staff_16',
			name: '松本',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 25000,
			max_monthly_income: 45000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'FIXED',
			tags: ['CW'],
			age_group: 'minor'
		},
		{
			id: 'staff_17',
			uid: 'staff_17',
			name: '井上',
			role: 'staff',
			hourlyWage: 980,
			hourly_wage: 980,
			target_monthly_income: 25000,
			max_monthly_income: 45000,
			preferredDaysPerWeek: 1,
			dayPreferencePolicy: 'ROTATING',
			tags: ['CW'],
			age_group: 'minor',
			isLateSubmission: true
		}
	]);

	// 2. カレンダー年月選択状態 (デフォルトは募集対象月である翌月に自動スライド)
	const today = new Date();
	let defaultYear = today.getFullYear();
	let defaultMonth = today.getMonth() + 2; // getMonth()は0-indexedなので+1で今月、+2で翌月
	if (defaultMonth > 12) {
		defaultMonth = 1;
		defaultYear += 1;
	}
	let currentYear = $state(defaultYear);
	let currentMonth = $state(defaultMonth);

	// 3. 表示タブ選択 ('puzzle' または 'settings')
	let activeTab = $state<'puzzle' | 'settings'>('puzzle');

	let monthlyConfirmedShifts = $state<{ [dateStr: string]: DailyShift }>({});
	let wishesMapByDate = $state<{ [dateStr: string]: { [staffId: string]: Wish } }>({});
	let eventDates = $state<string[]>([]);

	// ステージング（仮プレビュー）状態 ＆ 確定・送信済み状態
	let isStaging = $state(false);
	let isPublished = $state(false);
	let isPublishedToast = $state(false);

	// 各スタッフの当月希望ドキュメント情報 (キー: staffId)
	let staffWishesDocMap = $state<{
		[staffId: string]: {
			wishes: { [dateStr: string]: Wish };
			offDates: string[];
			target_monthly_income: number;
			max_monthly_income: number;
			preferredDaysPerWeek: number;
			dayPreferencePolicy: string;
			isSubmitted: boolean;
		};
	}>({});

	// 提出済み人数・未提出人数のリアクティブ算出
	let submittedCount = $derived(
		staffs.filter((s) => staffWishesDocMap[s.id]?.isSubmitted).length
	);
	let unsubmittedCount = $derived(staffs.length - submittedCount);

	let unsubscribeWishesListener: Unsubscribe | null = null;

	function setupRealtimeWishesListener(year: number, month: number) {
		if (unsubscribeWishesListener) {
			unsubscribeWishesListener();
			unsubscribeWishesListener = null;
		}

		try {
			unsubscribeWishesListener = subscribeMonthlyWishes(year, month, (docsData) => {
				console.log('[Realtime Wishes Sync] Received updated wishes for month:', `${year}-${month}`, docsData.length);
				const newDocMap: typeof staffWishesDocMap = { ...staffWishesDocMap };

				docsData.forEach((d) => {
					if (d.userId) {
						newDocMap[d.userId] = {
							wishes: d.wishes,
							offDates: d.offDates,
							target_monthly_income: d.target_monthly_income,
							max_monthly_income: d.max_monthly_income,
							preferredDaysPerWeek: d.preferredDaysPerWeek,
							dayPreferencePolicy: d.dayPreferencePolicy,
							isSubmitted: d.isSubmitted
						};

						// スタッフのローカルプロパティも即時反映！
						const sIdx = staffs.findIndex((st) => st.id === d.userId || st.uid === d.userId);
						if (sIdx !== -1) {
							if (d.offDates && d.offDates.length > 0) {
								staffs[sIdx].offDates = d.offDates;
							}
							if (d.target_monthly_income > 0) {
								staffs[sIdx].target_monthly_income = d.target_monthly_income;
							}
							if (d.max_monthly_income > 0) {
								staffs[sIdx].max_monthly_income = d.max_monthly_income;
							}
							if (d.preferredDaysPerWeek >= 0) {
								staffs[sIdx].preferredDaysPerWeek = d.preferredDaysPerWeek;
							}
							if (d.dayPreferencePolicy) {
								staffs[sIdx].dayPreferencePolicy = d.dayPreferencePolicy as any;
							}
						}

						// wishesMapByDate も即時更新
						if (d.wishes) {
							Object.entries(d.wishes).forEach(([dateStr, wishObj]) => {
								if (!wishesMapByDate[dateStr]) {
									wishesMapByDate[dateStr] = {};
								}
								wishesMapByDate[dateStr][d.userId] = normalizeWish(wishObj);
							});
						}
					}
				});

				staffWishesDocMap = newDocMap;
			});
		} catch (err) {
			console.warn('[Realtime Wishes Sync] Failed to set up listener:', err);
		}
	}

	// UNICES日別イベント情報 (キー: dateStr, デフォルト13:00-15:00, activeで有効化)
	let unicesEventsByDate = $state<{
		[dateStr: string]: { startTime: string; endTime: string; active: boolean };
	}>({});

	// フリースクール日別開講情報 (キー: dateStr, active=開講日)
	let fsDaysByDate = $state<{
		[dateStr: string]: { startTime: string; endTime: string; active: boolean };
	}>({});

	let considerIncomeWeight = $state<'none' | 'low' | 'high'>('low');
	let isLoading = $state(false);
	let isSavedToast = $state(false);
	let isSyncingNotion = $state(false);
	let isStaffSavedToast = $state(false);
	let isCopiedToast = $state(false);

	// 5. ポップオーバー表示用状態
	let popoverState = $state<{
		isOpen: boolean;
		dateStr: string | null;
		area: 'cafe' | 'fs' | 'unices' | null;
		x: number;
		y: number;
	}>({
		isOpen: false,
		dateStr: null,
		area: null,
		x: 0,
		y: 0
	});

	let pendingShiftRequests = $state<ShiftRequest[]>([]);
	let isRequestModalOpen = $state(false);

	onMount(() => {
		loadMonthData();
		const unsubReqs = subscribePendingShiftRequests((reqs) => {
			pendingShiftRequests = reqs;
		});
		return () => {
			if (unsubReqs) unsubReqs();
		};
	});

	async function handleApproveShiftRequest(req: ShiftRequest) {
		if (!req.id) return;
		try {
			await updateShiftRequestStatus(req.id, 'approved');
			if (req.date && req.userId) {
				const shift = monthlyConfirmedShifts[req.date];
				if (shift && shift.slots) {
					const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
					TIME_SLOTS.forEach((slot) => {
						slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
						slotsCopy[slot] = slotsCopy[slot].filter((a) => a.staffId !== req.userId);
					});
					monthlyConfirmedShifts[req.date] = { ...shift, slots: slotsCopy };
					monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
					await saveSingleDailyShift(req.date);
				}
			}
			console.log(`[ShiftRequest] Approved request ${req.id} for ${req.userName}`);
		} catch (err) {
			console.error('Failed to approve shift request:', err);
		}
	}

	async function handleRejectShiftRequest(req: ShiftRequest) {
		if (!req.id) return;
		try {
			await updateShiftRequestStatus(req.id, 'rejected');
			console.log(`[ShiftRequest] Rejected request ${req.id} for ${req.userName}`);
		} catch (err) {
			console.error('Failed to reject shift request:', err);
		}
	}

	// ログインユーザー自身をスタッフ一覧へ反映させるためのトリガー
	$effect(() => {
		if (authState.user && authState.user.uid) {
			const userUid = authState.user.uid;
			const exists = staffs.some((s) => s.id === userUid || s.uid === userUid);
			if (!exists) {
				loadMonthData();
			}
		}
	});

	// 管理者権限チェック (Authのロード完了を待ってからリダイレクト判定)
	$effect(() => {
		if (authState.loading) return;
		if (!authState.user?.isAdmin) {
			window.location.href = '/wishes';
		}
	});

	// 各スタッフの月給見込みをリアルタイム算出
	let staffExpectedWages = $derived.by(() => {
		const wages: { [staffId: string]: number } = {};
		staffs.forEach((s) => {
			let totalHours = 0;
			Object.values(monthlyConfirmedShifts).forEach((shift) => {
				if (shift && shift.slots) {
					Object.values(shift.slots).forEach((assignments) => {
						assignments.forEach((a) => {
							if (a.staffId === s.id) {
								totalHours += 0.25; // 15分 = 0.25h
							}
						});
					});
				}
			});
			const wage = Number(s.hourlyWage) || 1200;
			wages[s.id] = Math.round(totalHours * wage);
		});
		return wages;
	});

	// 各スタッフの総アサイン時間を算出
	let staffTotalHours = $derived.by(() => {
		const hours: { [staffId: string]: number } = {};
		staffs.forEach((s) => {
			let total = 0;
			Object.values(monthlyConfirmedShifts).forEach((shift) => {
				if (shift && shift.slots) {
					Object.values(shift.slots).forEach((assignments) => {
						assignments.forEach((a) => {
							if (a.staffId === s.id) {
								total += 0.25;
							}
						});
					});
				}
			});
			hours[s.id] = total;
		});
		return hours;
	});

	// カレンダーの日付セルを生成するための配列（日〜土） - リアクティブな一括事前算出
	let calendarDays = $derived.by(() => {
		// Svelte 5 の依存関係に明示的に登録するため、状態変数を直接読み取る
		const shifts = monthlyConfirmedShifts;
		const events = unicesEventsByDate;
		const staffList = staffs;
		const eDates = eventDates;

		const year = currentYear;
		const month = currentMonth;
		const daysInMonth = new Date(year, month, 0).getDate();
		const firstDayIndex = new Date(year, month - 1, 1).getDay();

		const list: {
			dateStr: string;
			dayNum: number;
			isPadding: boolean;
			dayOfWeek: number;
			cafeStaffs: { id: string; name: string; range: string }[];
			fsStaffs: { id: string; name: string; range: string }[];
			unicesStaffs: { id: string; name: string; range: string }[];
			isCafeShortage: boolean;
			isFsShortage: boolean;
			isUnicesShortage: boolean;
			unassignedStaffs: {
				staffId: string;
				staffName: string;
				role: 'employee' | 'adult' | 'minor';
			}[];
		}[] = [];

		// ローカルヘルパー関数 (各セルのアサインと時間を安全に算出)
		function getStaffRangeForCell(
			dateStr: string,
			staffId: string,
			area: 'cafe' | 'fs' | 'unices'
		): string {
			const shift = shifts[dateStr];
			if (!shift || !shift.slots) return '';

			const workingSlots = TIME_SLOTS.filter((slot) => {
				const assignments = shift.slots[slot] || [];
				return assignments.some((a) => a.staffId === staffId && a.area === area);
			}).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

			if (workingSlots.length === 0) return '';

			const startTime = workingSlots[0];
			const lastSlot = workingSlots[workingSlots.length - 1];

			const [h, m] = lastSlot.split(':').map(Number);
			let endM = m + 15;
			let endH = h;
			if (endM >= 60) {
				endM -= 60;
				endH += 1;
			}
			const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
			return `${startTime}-${endTime}`;
		}

		function getAssignedStaffListForCell(dateStr: string, area: 'cafe' | 'fs' | 'unices') {
			const shift = shifts[dateStr];
			if (!shift || !shift.slots) return [];

			const uniqueStaffIds = new Set<string>();
			const staffInfo: { id: string; name: string; range: string }[] = [];

			TIME_SLOTS.forEach((slot) => {
				const assignments = shift.slots[slot] || [];
				assignments.forEach((a) => {
					if (a.area === area && !uniqueStaffIds.has(a.staffId)) {
						uniqueStaffIds.add(a.staffId);
						const range = getStaffRangeForCell(dateStr, a.staffId, area);
						const staffObj = staffList.find((s) => s.id === a.staffId);
						const shortName = staffObj
							? staffObj.name.replace(/\s*\(.*?\)/, '')
							: a.staffName.replace(/\s*\(.*?\)/, '');
						staffInfo.push({ id: a.staffId, name: shortName, range });
					}
				});
			});

			return staffInfo;
		}

		function checkCafeShortageForCell(dateStr: string): boolean {
			const shift = shifts[dateStr];
			if (!shift || !shift.slots) return true;

			const isEvent = eDates.includes(dateStr);
			return TIME_SLOTS.some((slot) => {
				const assignments = shift.slots[slot] || [];
				const cafeCount = assignments.filter((a) => a.area === 'cafe').length;
				// 09:45開店は1名OK、20:15閉店は2名必須、日中は1名以上存在で充足
				const required = (slot === '20:15' ? 2 : 1) + (isEvent ? 1 : 0);
				return cafeCount < required;
			});
		}

		// FSエリア不足チェック (10:00-15:00 に2名)
		function checkFsShortageForCell(dateStr: string): boolean {
			const shift = shifts[dateStr];
			if (!shift || !shift.slots) return false;

			const isEvent = eDates.includes(dateStr);
			return TIME_SLOTS.some((slot) => {
				if (!isSlotInInterval(slot, '10:00', '15:00')) return false;
				const fsCount = (shift.slots[slot] || []).filter((a) => a.area === 'fs').length;
				const required = 2 + (isEvent ? 1 : 0);
				return fsCount < required;
			});
		}

		function checkUnicesShortageForCell(dateStr: string): boolean {
			const event = events[dateStr];
			if (!event || !event.active) return false;

			const shift = shifts[dateStr];
			if (!shift || !shift.slots) return true;

			return TIME_SLOTS.some((slot) => {
				if (isSlotInInterval(slot, event.startTime, event.endTime)) {
					const assignments = shift.slots[slot] || [];
					const unicesCount = assignments.filter((a) => a.area === 'unices').length;
					return unicesCount < 1;
				}
				return false;
			});
		}

		// 前月のパディング
		const prevMonthDays = new Date(year, month - 1, 0).getDate();
		for (let i = firstDayIndex - 1; i >= 0; i--) {
			const d = prevMonthDays - i;
			const prevM = month === 1 ? 12 : month - 1;
			const prevY = month === 1 ? year - 1 : year;
			const dateStr = `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayOfWeek = new Date(prevY, prevM - 1, d).getDay();
			list.push({
				dateStr,
				dayNum: d,
				isPadding: true,
				dayOfWeek,
				cafeStaffs: getAssignedStaffListForCell(dateStr, 'cafe'),
				fsStaffs: getAssignedStaffListForCell(dateStr, 'fs'),
				unicesStaffs: getAssignedStaffListForCell(dateStr, 'unices'),
				isCafeShortage: checkCafeShortageForCell(dateStr),
				isFsShortage: checkFsShortageForCell(dateStr),
				isUnicesShortage: checkUnicesShortageForCell(dateStr),
				unassignedStaffs: shifts[dateStr]?.unassignedStaffs || []
			});
		}

		// 今月の日付
		for (let d = 1; d <= daysInMonth; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayOfWeek = new Date(year, month - 1, d).getDay();
			list.push({
				dateStr,
				dayNum: d,
				isPadding: false,
				dayOfWeek,
				cafeStaffs: getAssignedStaffListForCell(dateStr, 'cafe'),
				fsStaffs: getAssignedStaffListForCell(dateStr, 'fs'),
				unicesStaffs: getAssignedStaffListForCell(dateStr, 'unices'),
				isCafeShortage: checkCafeShortageForCell(dateStr),
				isFsShortage: checkFsShortageForCell(dateStr),
				isUnicesShortage: checkUnicesShortageForCell(dateStr),
				unassignedStaffs: shifts[dateStr]?.unassignedStaffs || []
			});
		}

		// 翌月のパディング
		const totalSlots = 42;
		const nextPaddingCount = totalSlots - list.length;
		for (let d = 1; d <= nextPaddingCount; d++) {
			const nextM = month === 12 ? 1 : month + 1;
			const nextY = month === 12 ? year + 1 : year;
			const dateStr = `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayOfWeek = new Date(nextY, nextM - 1, d).getDay();
			list.push({
				dateStr,
				dayNum: d,
				isPadding: true,
				dayOfWeek,
				cafeStaffs: getAssignedStaffListForCell(dateStr, 'cafe'),
				fsStaffs: getAssignedStaffListForCell(dateStr, 'fs'),
				unicesStaffs: getAssignedStaffListForCell(dateStr, 'unices'),
				isCafeShortage: checkCafeShortageForCell(dateStr),
				isFsShortage: checkFsShortageForCell(dateStr),
				isUnicesShortage: checkUnicesShortageForCell(dateStr),
				unassignedStaffs: shifts[dateStr]?.unassignedStaffs || []
			});
		}

		return list;
	});

	// 時間を分に変換するローカルヘルパー
	function timeToMinutes(t: string): number {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + m;
	}

	// 特定スロットが指定区間内にあるか
	function isSlotInInterval(slot: string, start: string, end: string): boolean {
		const slotMin = timeToMinutes(slot);
		const startMin = timeToMinutes(start);
		const endMin = timeToMinutes(end);
		return slotMin >= startMin && slotMin < endMin;
	}

	// ローカル日付パース
	function parseLocalDate(dateStr: string): Date {
		const parts = dateStr.split('-');
		return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
	}

	// 未成年/研修生判定ヘルパー
	function isMinorOrTrainee(s: Staff): boolean {
		const isMinor = (s.age_group || s.role) === 'minor';
		const isTrainee = !!(s.is_trainee || s.isTrainee);
		return isMinor || isTrainee;
	}

	// 有効な相方判定ヘルパー
	function isValidPartner(s: Staff): boolean {
		const isEmployee = s.role === 'employee';
		const isAdult = (s.age_group || s.role) === 'adult';
		const hasFsTag = (s.tags ?? []).includes('FS');
		return isEmployee || (isAdult && hasFsTag);
	}

	// UNICES 日別イベント情報の初期化（水曜と金曜にデフォルトイベントを適用）
	function initUnicesEvents(year: number, month: number) {
		const lastDay = new Date(year, month, 0).getDate();
		const map: { [dateStr: string]: { startTime: string; endTime: string; active: boolean } } = {};
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayOfWeek = new Date(year, month - 1, d).getDay();
			// デフォルトで水曜(3)と金曜(5)にUNICESイベントがあることにする（テスト用ダミー）
			const active = dayOfWeek === 3 || dayOfWeek === 5;
			map[dateStr] = { startTime: '13:00', endTime: '15:00', active };
		}
		unicesEventsByDate = map;
	}

	// フリースクール 日別開講情報の初期化（月・水・金をデフォルト開講日に設定）
	function initFsDays(year: number, month: number) {
		const lastDay = new Date(year, month, 0).getDate();
		const map: { [dateStr: string]: { startTime: string; endTime: string; active: boolean } } = {};
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayOfWeek = new Date(year, month - 1, d).getDay();
			// デフォルトで月曜(1)・水曜(3)・金曜(5)をFS開講日とする（管理者画面で変更可能）
			const active = dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5;
			map[dateStr] = { startTime: '10:00', endTime: '15:00', active };
		}
		fsDaysByDate = map;
	}

	// 月全体の希望データをフェッチ＆自動シード
	async function loadMonthWishes(year: number, month: number) {
		const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
		const lastDay = new Date(year, month, 0).getDate();
		const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

		const wishesMap: { [dateStr: string]: { [staffId: string]: Wish } } = {};
		const offlineOrMock = isOfflineOrMockMode();

		const templatesMap: {
			[userId: string]: {
				[dayOfWeek: number]: {
					type: 'ng' | 'specific' | 'free';
					startTime: string;
					endTime: string;
				};
			};
		} = {};

		if (!offlineOrMock) {
			// 1. 全ての曜日テンプレートを Firestore から一括フェッチ
			const snap = await fetchWithTimeout(
				getDocs(collection(db, 'weekly_templates')),
				null,
				800
			);
			if (snap && snap.docs) {
				snap.docs.forEach((docSnap) => {
					const data = docSnap.data();
					const uid = data.userId;
					const day = parseDayOfWeek(data.dayOfWeek);
					if (uid && day !== null) {
						if (!templatesMap[uid]) {
							templatesMap[uid] = {};
						}
						templatesMap[uid][day] = {
							type: data.type || 'free',
							startTime: data.startTime || '09:45',
							endTime: data.endTime || '20:15'
						};
					}
				});
			}

			// 2. Firestore から実際の提出済み希望を取得
			const q = query(
				collection(db, 'wishes'),
				where('date', '>=', startDateStr),
				where('date', '<=', endDateStr)
			);
			const snapshot = await fetchWithTimeout(getDocs(q), null, 800);
			if (snapshot && snapshot.docs) {
				snapshot.docs.forEach((docSnap) => {
					const data = docSnap.data();
					const dateStr = data.date;
					const userId = data.userId;
					if (dateStr && userId) {
						if (!wishesMap[dateStr]) {
							wishesMap[dateStr] = {};
						}
						const rawWish = {
							date: dateStr,
							type: data.type || 'free',
							startTime: data.startTime || '09:45',
							endTime: data.endTime || '20:15',
							isOverridden: data.isOverridden || false,
							isSubmitted: data.isSubmitted !== undefined ? data.isSubmitted : true
						};
						const norm = normalizeWish(rawWish);
						wishesMap[dateStr][userId] = {
							date: dateStr,
							type: norm.type,
							startTime: norm.startTime,
							endTime: norm.endTime,
							isOverridden: norm.isOverridden || false,
							isSubmitted: norm.isSubmitted
						};
					}
				});
			}
		}

		// 3. テスト用に曜日テンプレート流し込み＆未提出者へのダミーシード
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const jsDate = parseLocalDate(dateStr);
			const dayOfWeek = jsDate.getDay(); // 0: 日, 1: 月, ...

			if (!wishesMap[dateStr]) {
				wishesMap[dateStr] = {};
			}

			staffs.forEach((s) => {
				if (!wishesMap[dateStr][s.id]) {
					// 曜日テンプレートを引く
					const template = templatesMap[s.id]?.[dayOfWeek];

					let wishType: 'free' | 'specific' | 'ng' = 'free';
					let startTime = '09:45';
					let endTime = '20:15';

					if (template) {
						wishType = template.type;
						startTime = template.startTime;
						endTime = template.endTime;
					} else {
						// リアルな不規則希望時間のダミーシード
						if (s.name.includes('山口')) {
							wishType = d % 4 === 0 ? 'ng' : 'specific';
							startTime = '13:15';
							endTime = '18:00';
						} else if (s.name.includes('松本')) {
							wishType = d % 3 === 0 ? 'ng' : 'specific';
							startTime = '10:30';
							endTime = '14:45';
						} else if (s.name.includes('井上')) {
							wishType = d % 5 === 0 ? 'ng' : 'specific';
							startTime = '15:00';
							endTime = '20:15';
						} else if (s.tags?.includes('UNICES')) {
							const unicesTimes = [
								{ start: '12:45', end: '17:15' },
								{ start: '11:00', end: '16:30' },
								{ start: '13:30', end: '18:15' },
								{ start: '12:15', end: '16:45' }
							];
							const idx = (s.name.charCodeAt(0) + d) % unicesTimes.length;
							wishType = d % 6 === 0 ? 'ng' : 'specific';
							startTime = unicesTimes[idx].start;
							endTime = unicesTimes[idx].end;
						} else {
							const seed = (d + s.name.charCodeAt(0)) % 10;
							if (s.role === 'minor') {
								if (seed === 1 || seed === 2) {
									wishType = 'ng';
								} else if (seed === 3 || seed === 4) {
									wishType = 'specific';
									startTime = '17:00';
									endTime = '20:15';
								}
							} else if (s.role === 'employee') {
								if (seed === 0) {
									wishType = 'ng';
								} else if (seed === 1 || seed === 2) {
									wishType = 'specific';
									startTime = '09:45';
									endTime = '15:00';
								}
							} else {
								// adult
								if (seed === 1 || seed === 2) {
									wishType = 'ng';
								} else if (seed === 3) {
									wishType = 'specific';
									startTime = '13:15';
									endTime = '18:00';
								} else if (seed === 4) {
									wishType = 'specific';
									startTime = '10:30';
									endTime = '14:45';
								} else if (seed === 5) {
									wishType = 'specific';
									startTime = '15:00';
									endTime = '20:15';
								}
							}
						}
					}

					const rawWish = {
						date: dateStr,
						type: wishType,
						startTime,
						endTime,
						isOverridden: false,
						isSubmitted: false
					};
					const norm = normalizeWish(rawWish);

					const isSubmittedMock = true;

					wishesMap[dateStr][s.id] = {
						date: dateStr,
						type: norm.type,
						startTime: norm.startTime,
						endTime: norm.endTime,
						isOverridden: norm.isOverridden || false,
						isSubmitted: isSubmittedMock
					};
				} else {
					// 既存の希望データがある場合も強力に標準化
					const wish = wishesMap[dateStr][s.id];
					const norm = normalizeWish(wish);
					wishesMap[dateStr][s.id] = {
						date: dateStr,
						type: norm.type,
						startTime: norm.startTime,
						endTime: norm.endTime,
						isOverridden: norm.isOverridden || false,
						isSubmitted: wish.isSubmitted
					};
				}
			});
		}

		return wishesMap;
	}

	// 月全体の確定シフトデータをロード (ローカルキャッシュ0ms即時復元 ＋ Firestore shifts/yearMonth 一括復元)
	async function loadMonthShifts(year: number, month: number) {
		isLoading = true;

		// 1. ローカルキャッシュがあれば最速（0ms）で即時復元描画
		const cachedMap = loadConfirmedShiftsFromLocalCache(year, month);
		if (cachedMap && Object.keys(cachedMap).length > 0) {
			const hasAssignments = Object.values(cachedMap).some(
				(s) => s.slots && Object.values(s.slots).some((arr) => Array.isArray(arr) && arr.length > 0)
			);
			if (hasAssignments) {
				monthlyConfirmedShifts = { ...cachedMap };
				console.log('[MonthShifts] Loaded non-empty shift state from LocalStorage cache instantly.');
			}
		}

		// 2. Firestore の shifts/${targetYearMonth} ドキュメントから自動復元ロード
		try {
			const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;
			const docSnap = await fetchWithTimeout(getDoc(doc(db, 'shifts', targetYearMonth)), null, 1200);

			if (docSnap && docSnap.exists()) {
				const data = docSnap.data();
				if (data && data.assignments && Object.keys(data.assignments).length > 0) {
					monthlyConfirmedShifts = { ...data.assignments };
					saveConfirmedShiftsToLocalCache(year, month, data.assignments);
					console.log(`[MonthShifts] Restored shift data from Firestore doc shifts/${targetYearMonth}`);
				}
			} else {
				// フォールバック取得
				const fetchedShifts = await getMonthlyConfirmedShifts(year, month);
				if (fetchedShifts && fetchedShifts.length > 0) {
					const updatedMap: { [dateStr: string]: DailyShift } = { ...monthlyConfirmedShifts };
					fetchedShifts.forEach((s) => {
						if (s.date && s.slots) {
							updatedMap[s.date] = s;
						}
					});
					monthlyConfirmedShifts = { ...updatedMap };
					saveConfirmedShiftsToLocalCache(year, month, monthlyConfirmedShifts);
				}
			}
		} catch (err) {
			console.warn('[MonthShifts] Firestore shift fetch skipped or failed, local cache preserved:', err);
		} finally {
			isLoading = false;
		}
	}

	function isOfflineOrMockMode(): boolean {
		if (typeof window !== 'undefined' && !navigator.onLine) return true;
		if (authState.isOfflineMode) return true;
		if (authState.user && authState.user.uid && authState.user.uid.startsWith('mock_')) return true;
		return false;
	}

	async function fetchWithTimeout<T>(fetchPromise: Promise<T>, fallbackValue: T, timeoutMs = 800): Promise<T> {
		let timer: ReturnType<typeof setTimeout>;
		const timeoutPromise = new Promise<T>((resolve) => {
			timer = setTimeout(() => {
				console.warn(`[Firestore Safe Guard] Communications timed out (${timeoutMs}ms). Instant fallback applied.`);
				resolve(fallbackValue);
			}, timeoutMs);
		});

		try {
			const result = await Promise.race([fetchPromise, timeoutPromise]);
			clearTimeout(timer!);
			return result;
		} catch (e) {
			clearTimeout(timer!);
			console.warn('[Firestore Safe Guard] Error caught, applying fallback:', e);
			return fallbackValue;
		}
	}

	// 月データ一括ロード処理
	async function loadMonthData() {
		isLoading = true;
		try {
			const offlineOrMock = isOfflineOrMockMode();

			// 0. UNICES & FS の日程固定設定をロード
			if (offlineOrMock) {
				console.log('[Matrix Settings] Bypassed Firestore fetch (Offline/Mock Mode)');
				initUnicesEvents(currentYear, currentMonth);
				initFsDays(currentYear, currentMonth);
			} else {
				const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
				const snap = await fetchWithTimeout(
					getDoc(doc(db, 'system_matrix_settings', docId)),
					null,
					800
				);
				if (snap && snap.exists()) {
					const data = snap.data();
					unicesEventsByDate = data.unicesEvents || {};
					fsDaysByDate = data.fsDays || {};
					console.log('[Matrix Settings] Loaded custom UNICES & FS settings from Firestore.');
				} else {
					initUnicesEvents(currentYear, currentMonth);
					initFsDays(currentYear, currentMonth);
				}
			}

			// 0.1. Global settings (eventDates) をロード
			if (offlineOrMock) {
				eventDates = [];
			} else {
				const settingsSnap = await fetchWithTimeout(
					getDoc(doc(db, 'settings', 'global')),
					null,
					800
				);
				if (settingsSnap && settingsSnap.exists()) {
					const settingsData = settingsSnap.data();
					eventDates = settingsData.eventDates || [];
					console.log('[Settings] Loaded eventDates from Firestore:', eventDates);
				} else {
					eventDates = [];
				}
			}

			// 1. 全スタッフ情報を取得
			try {
				let loaded = offlineOrMock ? staffs : await getStaffDetails(staffs);
				if (loaded && loaded.length > 0) {
					if (authState.user && authState.user.uid) {
						const userUid = authState.user.uid;
						const exists = loaded.some((s) => s.id === userUid || s.uid === userUid);
						if (!exists) {
							loaded = [
								{
									id: userUid,
									name: authState.user.name || '自分 (テスト管理者)',
									role: 'employee',
									targetIncomeMin: 180000,
									targetIncomeMax: 250000,
									hourlyWage: 1500,
									uid: userUid
								},
								...loaded
							];
						}
					}
					staffs = loaded;
				}
			} catch (e) {
				console.warn('Firebase staff details fetch skipped, using initial seed.', e);
			}

			// 2. 月全体の確定シフトを取得 (LocalStorageキャッシュ 0ms 展開 ＋ Firestore自動取得)
			await loadMonthShifts(currentYear, currentMonth);

			// 3. 月全体の希望データを取得＆自動シード
			wishesMapByDate = await loadMonthWishes(currentYear, currentMonth);

		} catch (e) {
			console.error('[Admin Shift] Failed to load month data:', e);
		} finally {
			isLoading = false;
		}
	}

	// 前月切り替え
	async function handlePrevMonth() {
		if (currentMonth === 1) {
			currentMonth = 12;
			currentYear -= 1;
		} else {
			currentMonth -= 1;
		}
		popoverState.isOpen = false;
		await loadMonthData();
	}

	// 翌月切り替え
	async function handleNextMonth() {
		if (currentMonth === 12) {
			currentMonth = 1;
			currentYear += 1;
		} else {
			currentMonth += 1;
		}
		popoverState.isOpen = false;
		await loadMonthData();
	}

	async function triggerMonthlyAutoGenerate() {
		isLoading = true;
		console.log("⚡️ [UI] 自動生成ボタンが押されました");
		try {
			const year = currentYear;
			const month = currentMonth;
			const lastDay = new Date(year, month, 0).getDate();

			// 0. スタッフ一覧にリアルタイム同期された希望データ (offDates 等) を 100% 確実に合成
			const parseDateStr = (d: any) => {
				if (!d) return '';
				const str = String(d).trim().replace(/\//g, '-').split('T')[0];
				const parts = str.split('-');
				if (parts.length === 3) {
					return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
				}
				return str;
			};

			const enrichedStaffs = staffs.map((s) => {
				const wishDoc = staffWishesDocMap[s.id] || staffWishesDocMap[s.uid || ''];

				const rawOffDates: string[] = [];
				if (wishDoc?.offDates && Array.isArray(wishDoc.offDates)) {
					rawOffDates.push(...wishDoc.offDates);
				}
				if (s.offDates && Array.isArray(s.offDates)) {
					rawOffDates.push(...s.offDates);
				}

				for (let d = 1; d <= lastDay; d++) {
					const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
					const dayWish = wishesMapByDate[dateStr]?.[s.id];
					if ((dayWish as any) === 'ng' || dayWish?.type === 'ng') {
						rawOffDates.push(dateStr);
					}
				}

				// LocalStorage からの緊急フォールバック読み込み (Firestore遅延対策)
				let lsTargetIncome = 0;
				let lsMaxIncome = 0;
				let lsPreferredDays = 0;
				let lsPolicy = '';
				if (typeof window !== 'undefined') {
					const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
					const lsKeys = [`wish_${yearMonth}_${s.id}`, `wishes_${yearMonth}_${s.id}`];
					for (const k of lsKeys) {
						const lsRaw = localStorage.getItem(k);
						if (lsRaw) {
							try {
								const parsed = JSON.parse(lsRaw);
								if (parsed.offDates && Array.isArray(parsed.offDates)) {
									rawOffDates.push(...parsed.offDates);
								}
								if (parsed.target_monthly_income) lsTargetIncome = Number(parsed.target_monthly_income);
								if (parsed.max_monthly_income) lsMaxIncome = Number(parsed.max_monthly_income);
								if (parsed.preferredDaysPerWeek) lsPreferredDays = Number(parsed.preferredDaysPerWeek);
								if (parsed.dayPreferencePolicy) lsPolicy = parsed.dayPreferencePolicy;
							} catch {}
						}
					}
				}

				const normalizedOffDates = Array.from(new Set(rawOffDates.map(parseDateStr)));

				return {
					...s,
					offDates: normalizedOffDates,
					target_monthly_income: wishDoc?.target_monthly_income || lsTargetIncome || s.target_monthly_income || 50000,
					max_monthly_income: wishDoc?.max_monthly_income || lsMaxIncome || s.max_monthly_income || 80000,
					preferredDaysPerWeek:
						wishDoc?.preferredDaysPerWeek !== undefined
							? Number(wishDoc.preferredDaysPerWeek)
							: lsPreferredDays || s.preferredDaysPerWeek || 0,
					dayPreferencePolicy: wishDoc?.dayPreferencePolicy || lsPolicy || s.dayPreferencePolicy || 'ANY'
				};
			});

			// 1. 純粋 TypeScript 自動生成エンジン関数を直接実行 (0.001秒・ブラウザF12ログ一発表示)
			const { assignments } = runPureMathAutoShiftEngine({
				year,
				month,
				staffs: enrichedStaffs,
				wishesMapByDate,
				unicesEventsByDate,
				fsDaysByDate,
				eventDates
			});

			// 2. すべての日のスロットを空で初期化
			const newShiftsMap: { [dateStr: string]: DailyShift } = {};
			for (let d = 1; d <= lastDay; d++) {
				const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const slots: { [time: string]: ShiftAssignment[] } = {};
				TIME_SLOTS.forEach((slot) => {
					slots[slot] = [];
				});
				newShiftsMap[dateStr] = { date: dateStr, slots, unassignedStaffs: [] };
			}

			// 3. アサイン結果を newShiftsMap にマッピング
			assignments.forEach((assign) => {
				if (!assign.assignedStaffId) return; // 空文字の場合は未充足

				const staff = staffs.find((s) => s.id === assign.assignedStaffId);
				if (!staff) return;

				const dateStr = assign.date;
				const dayShift = newShiftsMap[dateStr];
				if (!dayShift) return;

				let area: 'cafe' | 'fs' | 'unices' = 'cafe';
				if (assign.slotId.includes('_FS_')) area = 'fs';
				if (assign.slotId.includes('_UNICES_')) area = 'unices';

				TIME_SLOTS.forEach((slot) => {
					if (isSlotInInterval(slot, assign.startTime, assign.endTime)) {
						dayShift.slots[slot].push({
							staffId: staff.id,
							staffName: staff.name,
							role:
								(staff.age_group || staff.role) === 'minor'
									? 'minor'
									: staff.role === 'employee'
										? 'employee'
										: 'adult',
							area: area,
							isRarePinned: false
						});
					}
				});
			});

			// --- 全スロット割り当て完了後、日ごとの後処理を実行 ---
			for (let d = 1; d <= lastDay; d++) {
				const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const dayShift = newShiftsMap[dateStr];
				const slots = dayShift.slots;

				// --- STEP F: あぶれた希望提出者（あぶれメンバー）のストック ---
				const allAssignedIds = new Set<string>();
				TIME_SLOTS.forEach((slot) => {
					slots[slot].forEach((a) => allAssignedIds.add(a.staffId));
				});

				const dayWishes = wishesMapByDate[dateStr] || {};
				const unassignedStaffs: {
					staffId: string;
					staffName: string;
					role: 'employee' | 'adult' | 'minor';
				}[] = [];
				staffs.forEach((s) => {
					if (allAssignedIds.has(s.id)) return;
					const wish = dayWishes[s.id];
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

				newShiftsMap[dateStr].unassignedStaffs = unassignedStaffs;
			}

			// Svelteが再描画を確実に検知できるよう、再代入を実行して一瞬で即時再描画させる！
			monthlyConfirmedShifts = { ...newShiftsMap };

			// 1. ローカルストレージキャッシュに即時保存 (0ms 復元保護)
			saveConfirmedShiftsToLocalCache(year, month, newShiftsMap);

			// 2. Firestore の shifts/${yearMonth} ドキュメントへ自動 setDoc (永続化 ＆ 画面移動/リロード消去防止)
			const targetYearMonth = `${year}-${String(month).padStart(2, '0')}`;
			try {
				await setDoc(
					doc(db, 'shifts', targetYearMonth),
					{
						yearMonth: targetYearMonth,
						assignments: newShiftsMap,
						updatedAt: Timestamp.now()
					},
					{ merge: true }
				);
				console.log(`[AutoGenerate] Auto-persisted generated shifts to Firestore doc shifts/${targetYearMonth}`);
			} catch (fsErr) {
				console.warn(`[AutoGenerate] Firestore auto-persist skipped or failed, local cache preserved:`, fsErr);
			}

			// 自動生成完了時は「未確定・ステージング（仮プレビュー）」状態にする！
			isStaging = true;
			isPublished = false;
			console.log("✅ [UI] 新アルゴリズムによるシフト生成・描画が完了しました", newShiftsMap);
		} catch (e) {
			console.error('Error generating monthly shifts:', e);
		} finally {
			isLoading = false;
		}
	}

	const handleAutoGenerate = triggerMonthlyAutoGenerate;

	/**
	 * 【⚡️ シフトを確定してスタッフへ送信（公開）】
	 * 管理者が確認後「確定して送信」を押したタイミングで、Firestore confirmed_shifts コレクションへ
	 * 確定書き込みを実行し、全端末へリアルタイム配信（0秒同期）を完了させる！
	 */
	async function handlePublishConfirmedShifts() {
		if (isLoading) return;
		isLoading = true;
		try {
			const targetYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

			// 1. ローカルストレージへ即時保存
			saveConfirmedShiftsToLocalCache(currentYear, currentMonth, monthlyConfirmedShifts);

			// 2. 統一仕様パス: shifts/${yearMonth} ドキュメントへ確定シフト一括保存
			const mainShiftRef = doc(db, 'shifts', targetYearMonth);
			await setDoc(
				mainShiftRef,
				{
					yearMonth: targetYearMonth,
					assignments: monthlyConfirmedShifts,
					updatedAt: Timestamp.now()
				},
				{ merge: true }
			);

			// 3. 後方互換のため confirmed_shifts コレクションへの個別日付書き込みも並行処理
			const batch = writeBatch(db);
			Object.values(monthlyConfirmedShifts).forEach((shift) => {
				if (shift && shift.date) {
					const cDocRef = doc(db, 'confirmed_shifts', shift.date);
					batch.set(cDocRef, {
						date: shift.date,
						slots: shift.slots || {},
						unassignedStaffs: shift.unassignedStaffs || [],
						updatedAt: Timestamp.now()
					});
				}
			});
			await fetchWithTimeout(batch.commit(), undefined, 2500);

			console.log(`[PublishShifts] Successfully committed confirmed shifts to shifts/${targetYearMonth} in Firestore.`);

			// 固定設定（UNICES/FS日程）も同時に保存
			saveUnicesAndFsSettings().catch(() => {});

			// バックグラウンドで Notion バックアップを並行トリガー
			if (typeof window !== 'undefined' && navigator.onLine) {
				isSyncingNotion = true;
				Promise.all(
					Object.values(monthlyConfirmedShifts).map((shift) => {
						if (shift && shift.slots) {
							const hasAssignments = Object.values(shift.slots).some((arr) => arr && arr.length > 0);
							if (hasAssignments) {
								return backupToNotion(shift);
							}
						}
						return Promise.resolve(true);
					})
				).finally(() => {
					isSyncingNotion = false;
				});
			}

			// ステータスを「確定・公開済み」へ遷移させる
			isStaging = false;
			isPublished = true;
			isPublishedToast = true;

			setTimeout(() => {
				isPublishedToast = false;
			}, 4000);
		} catch (err) {
			console.error('Error publishing monthly shifts:', err);
			alert('確定・送信中にエラーが発生しました。');
		} finally {
			isLoading = false;
		}
	}

	// 考慮度の変更ハンドラ
	function changeIncomeWeight(weight: 'none' | 'low' | 'high') {
		considerIncomeWeight = weight;
	}

	// カレンダーの日付セル用：スタッフ勤務時間範囲の取得
	function getStaffTimeRange(
		dateStr: string,
		staffId: string,
		area: 'cafe' | 'fs' | 'unices'
	): string {
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift || !shift.slots) return '';

		const workingSlots = TIME_SLOTS.filter((slot) => {
			const assignments = shift.slots[slot] || [];
			return assignments.some((a) => a.staffId === staffId && a.area === area);
		}).sort((a, b) => timeToMinutes(a) - timeToMinutes(b));

		if (workingSlots.length === 0) return '';

		const startTime = workingSlots[0];
		const lastSlot = workingSlots[workingSlots.length - 1];

		// 終了時刻計算 (最終スロット+15分)
		const [h, m] = lastSlot.split(':').map(Number);
		let endM = m + 15;
		let endH = h;
		if (endM >= 60) {
			endM -= 60;
			endH += 1;
		}
		const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
		return `${startTime}-${endTime}`;
	}

	// カレンダーの日付セル用：アサインされているスタッフ情報のコンパクト取得
	function getAssignedStaffList(dateStr: string, area: 'cafe' | 'fs' | 'unices') {
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift || !shift.slots) return [];

		const uniqueStaffIds = new Set<string>();
		const staffInfo: { id: string; name: string; range: string }[] = [];

		TIME_SLOTS.forEach((slot) => {
			const assignments = shift.slots[slot] || [];
			assignments.forEach((a) => {
				if (a.area === area && !uniqueStaffIds.has(a.staffId)) {
					uniqueStaffIds.add(a.staffId);
					const range = getStaffTimeRange(dateStr, a.staffId, area);
					const staffObj = staffs.find((s) => s.id === a.staffId);
					const shortName = staffObj
						? staffObj.name.replace(/\s*\(.*?\)/, '')
						: a.staffName.replace(/\s*\(.*?\)/, '');
					staffInfo.push({ id: a.staffId, name: shortName, range });
				}
			});
		});

		return staffInfo;
	}

	// カフェ不足チェック (09:45開店は1名OK, 20:15閉店は2名必須, 日中は1名以上で充足)
	function checkCafeShortage(dateStr: string): boolean {
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift || !shift.slots) return true;

		return TIME_SLOTS.some((slot) => {
			const assignments = shift.slots[slot] || [];
			const cafeCount = assignments.filter((a) => a.area === 'cafe').length;
			const required = slot === '20:15' ? 2 : 1;
			return cafeCount < required;
		});
	}

	// UNICES不足チェック (イベント開催時間内に1人以上)
	function checkUnicesShortage(dateStr: string): boolean {
		const event = unicesEventsByDate[dateStr];
		if (!event || !event.active) return false;

		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift || !shift.slots) return true;

		return TIME_SLOTS.some((slot) => {
			if (isSlotInInterval(slot, event.startTime, event.endTime)) {
				const assignments = shift.slots[slot] || [];
				const unicesCount = assignments.filter((a) => a.area === 'unices').length;
				return unicesCount < 1;
			}
			return false;
		});
	}

	// ポップオーバーメニューの起動 (Eventタイプに対応)
	function openPopover(e: Event, dateStr: string, area: 'cafe' | 'fs' | 'unices') {
		e.stopPropagation();
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();

		popoverState = {
			isOpen: true,
			dateStr,
			area,
			x: rect.left + window.scrollX,
			y: rect.bottom + window.scrollY + 6
		};
	}

	// ウィンドウ全体のクリックでのポップオーバー閉じ
	function handleWindowClick() {
		if (popoverState.isOpen) {
			popoverState.isOpen = false;
		}
	}

	// 日付セル内のバッジ横「×」ボタンから直接アサイン解除を高速実行する（イミュータブル・スプレッド完全再代入）
	function removeStaffAssignmentDirectly(
		e: Event,
		dateStr: string,
		staffId: string,
		area: 'cafe' | 'fs' | 'unices'
	) {
		e.stopPropagation(); // ポップオーバーが開くのを完全に防止

		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift) return;

		// ディープコピーして不変性を保証
		const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
			slotsCopy[slot] = slotsCopy[slot].filter((a) => !(a.staffId === staffId && a.area === area));
		});

		monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
		monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
		saveSingleDailyShift(dateStr);
	}

	/**
	 * あぶれメンバーを直接アサインする（空き枠埋め）
	 */
	function quickAssignUnassignedStaff(
		staffId: string,
		dateStr: string,
		area: 'cafe' | 'fs' | 'unices'
	) {
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift) return;

		const staff = staffs.find((s) => s.id === staffId);
		if (!staff) return;

		const wish = wishesMapByDate[dateStr]?.[staffId];
		let startStr = '09:45';
		let endStr = '20:15';

		if (wish && wish.type === 'specific') {
			startStr = wish.startTime;
			endStr = wish.endTime;
		}

		// slotsをディープクローン
		const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
		});

		// 該当スタッフをアサイン
		TIME_SLOTS.forEach((slot) => {
			if (isSlotInInterval(slot, startStr, endStr)) {
				slotsCopy[slot] = slotsCopy[slot].filter(
					(a) => !(a.staffId === staffId && a.area === area)
				);
				slotsCopy[slot].push({
					staffId: staff.id,
					staffName: staff.name,
					role:
						(staff.age_group || staff.role) === 'minor'
							? 'minor'
							: staff.role === 'employee'
								? 'employee'
								: 'adult',
					area: area
				});
			}
		});

		// あぶれリスト（unassignedStaffs）から除外
		const unassignedCopy = (shift.unassignedStaffs || []).filter((u) => u.staffId !== staffId);

		// 確定シフト辞書を更新
		monthlyConfirmedShifts[dateStr] = {
			...shift,
			slots: slotsCopy,
			unassignedStaffs: unassignedCopy
		};
		monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
		saveSingleDailyShift(dateStr);
	}

	/**
	 * あぶれメンバーと配置済みメンバーを交代（スワップ）する
	 */
	function swapStaffAssignments(
		unassignedStaffId: string,
		assignedStaffId: string,
		dateStr: string,
		area: 'cafe' | 'fs' | 'unices'
	) {
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift) return;

		const unassignedStaff = staffs.find((s) => s.id === unassignedStaffId);
		const assignedStaff = staffs.find((s) => s.id === assignedStaffId);
		if (!unassignedStaff || !assignedStaff) return;

		// 交代される側の割り当てスロット情報を特定
		const assignedSlots: string[] = [];
		TIME_SLOTS.forEach((slot) => {
			const assignments = shift.slots[slot] || [];
			if (assignments.some((a) => a.staffId === assignedStaffId && a.area === area)) {
				assignedSlots.push(slot);
			}
		});

		if (assignedSlots.length === 0) return;

		// slotsをディープクローン
		const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
		});

		// 交代される側のスタッフを除外
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = slotsCopy[slot].filter(
				(a) => !(a.staffId === assignedStaffId && a.area === area)
			);
		});

		// あぶれメンバーをアサイン
		const wish = wishesMapByDate[dateStr]?.[unassignedStaffId];
		let startStr = '09:45';
		let endStr = '20:15';
		if (wish && wish.type === 'specific') {
			startStr = wish.startTime;
			endStr = wish.endTime;
		}

		assignedSlots.forEach((slot) => {
			if (wish && wish.type === 'specific') {
				if (isSlotInInterval(slot, startStr, endStr)) {
					slotsCopy[slot].push({
						staffId: unassignedStaff.id,
						staffName: unassignedStaff.name,
						role:
							(unassignedStaff.age_group || unassignedStaff.role) === 'minor'
								? 'minor'
								: unassignedStaff.role === 'employee'
									? 'employee'
									: 'adult',
						area: area
					});
				}
			} else {
				slotsCopy[slot].push({
					staffId: unassignedStaff.id,
					staffName: unassignedStaff.name,
					role:
						(unassignedStaff.age_group || unassignedStaff.role) === 'minor'
							? 'minor'
							: unassignedStaff.role === 'employee'
								? 'employee'
								: 'adult',
					area: area
				});
			}
		});

		// あぶれリスト（unassignedStaffs）の更新
		let unassignedCopy = [...(shift.unassignedStaffs || [])];
		unassignedCopy = unassignedCopy.filter((u) => u.staffId !== unassignedStaffId);
		if (!unassignedCopy.some((u) => u.staffId === assignedStaffId)) {
			unassignedCopy.push({
				staffId: assignedStaff.id,
				staffName: assignedStaff.name,
				role:
					(assignedStaff.age_group || assignedStaff.role) === 'minor'
						? 'minor'
						: assignedStaff.role === 'employee'
							? 'employee'
							: 'adult'
			});
		}

		// 確定シフト辞書を更新
		monthlyConfirmedShifts[dateStr] = {
			...shift,
			slots: slotsCopy,
			unassignedStaffs: unassignedCopy
		};
		monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
		saveSingleDailyShift(dateStr);
	}

	// ポップオーバー内でのスタッフのアサイン切替トグル（ディープコピー不変マージ・即時再描画）
	function toggleStaffAssignmentInPopover(staffId: string) {
		const dateStr = popoverState.dateStr;
		const area = popoverState.area;
		if (!dateStr || !area) return;

		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift) return;

		const staff = staffs.find((s) => s.id === staffId);
		if (!staff) return;

		// 不変性を確保するため、slotsおよびスロット配列を全てディープクローン
		const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
		});

		let isCurrentlyAssigned = false;
		TIME_SLOTS.forEach((slot) => {
			if (slotsCopy[slot].some((a) => a.staffId === staffId && a.area === area)) {
				isCurrentlyAssigned = true;
			}
		});

		if (isCurrentlyAssigned) {
			// 削除: このエリアのこのスタッフを綺麗に除外
			TIME_SLOTS.forEach((slot) => {
				slotsCopy[slot] = slotsCopy[slot].filter(
					(a) => !(a.staffId === staffId && a.area === area)
				);
			});
		} else {
			// 追加（マージ・不変結合）: 他スタッフの配置を壊さず結合する
			const wish = wishesMapByDate[dateStr]?.[staffId];
			let startStr = '09:45';
			let endStr = '20:15';

			if (wish && wish.type === 'specific') {
				startStr = wish.startTime;
				endStr = wish.endTime;
			}

			TIME_SLOTS.forEach((slot) => {
				if (isSlotInInterval(slot, startStr, endStr)) {
					// すでに同じスロットに存在していれば重複排除したのち、配列に結合
					slotsCopy[slot] = slotsCopy[slot].filter(
						(a) => !(a.staffId === staffId && a.area === area)
					);
					slotsCopy[slot].push({
						staffId: staff.id,
						staffName: staff.name,
						role:
							(staff.age_group || staff.role) === 'minor'
								? 'minor'
								: staff.role === 'employee'
									? 'employee'
									: 'adult',
						area: area
					});
				}
			});
		}

		// 辞書オブジェクト自体と該当日のオブジェクトを再代入し、Svelteに即時検知・描画させる！
		monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
		monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
		saveSingleDailyShift(dateStr);
	}

	// 直接テキスト変更時のインライン処理（ディープコピー不変マージ・即時再描画）
	function handlePopoverTimeChange(staffId: string, event: Event) {
		const dateStr = popoverState.dateStr;
		const area = popoverState.area;
		if (!dateStr || !area) return;

		const val = (event.target as HTMLInputElement).value.trim();
		const shift = monthlyConfirmedShifts[dateStr];
		if (!shift) return;

		const staff = staffs.find((s) => s.id === staffId);
		if (!staff) return;

		// slotsをディープクローン
		const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
		});

		if (val === '') {
			// 空欄時はアサイン削除
			TIME_SLOTS.forEach((slot) => {
				slotsCopy[slot] = slotsCopy[slot].filter(
					(a) => !(a.staffId === staffId && a.area === area)
				);
			});
			monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
			monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
			saveSingleDailyShift(dateStr);
			return;
		}

		const parsed = parseRangeToSlots(val);
		if (!parsed) return;

		// 一旦既存のこの日付・エリアのアサインを全削除
		TIME_SLOTS.forEach((slot) => {
			slotsCopy[slot] = slotsCopy[slot].filter((a) => !(a.staffId === staffId && a.area === area));
		});

		// 新たなスロットにアサイン追加（他のスタッフは維持！）
		TIME_SLOTS.forEach((slot) => {
			if (isSlotInInterval(slot, parsed.start, parsed.end)) {
				slotsCopy[slot] = slotsCopy[slot].filter(
					(a) => !(a.staffId === staffId && a.area === area)
				);
				slotsCopy[slot].push({
					staffId: staff.id,
					staffName: staff.name,
					role:
						(staff.age_group || staff.role) === 'minor'
							? 'minor'
							: staff.role === 'employee'
								? 'employee'
								: 'adult',
					area: area
				});
			}
		});

		monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
		monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
		saveSingleDailyShift(dateStr);
	}

	// 時間テキストを綺麗にパースする
	function parseRangeToSlots(rangeStr: string): { start: string; end: string } | null {
		let clean = rangeStr.replace(/[〜~ー]/g, '-').replace(/\s+/g, '');

		// hh:mm-hh:mm
		let match = clean.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
		if (match) {
			return {
				start: `${match[1].padStart(2, '0')}:${match[2]}`,
				end: `${match[3].padStart(2, '0')}:${match[4]}`
			};
		}

		// hh-hh
		match = clean.match(/^(\d{1,2})-(\d{1,2})$/);
		if (match) {
			return {
				start: `${match[1].padStart(2, '0')}:00`,
				end: `${match[2].padStart(2, '0')}:00`
			};
		}

		// hhhh-hhhh
		match = clean.match(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/);
		if (match) {
			return {
				start: `${match[1]}:${match[2]}`,
				end: `${match[3]}:${match[4]}`
			};
		}

		return null;
	}

	// 全日付の一括保存処理（Firestoreバッチ ＋ ローカルキャッシュ ＋ リアルタイム配信）
	async function handleSaveAllMonthlyShifts(silent = false) {
		if (!silent) isLoading = true;
		try {
			// 1. ローカルストレージへ即時永続保存 (0ms保護)
			saveConfirmedShiftsToLocalCache(currentYear, currentMonth, monthlyConfirmedShifts);

			// 2. Firestore へ書き込み (onSnapshot リスナーにより全スタッフ画面に即時反映)
			const batch = writeBatch(db);

			Object.values(monthlyConfirmedShifts).forEach((shift) => {
				if (shift && shift.date) {
					const docRef = doc(db, 'confirmed_shifts', shift.date);
					batch.set(docRef, {
						date: shift.date,
						slots: shift.slots || {},
						unassignedStaffs: shift.unassignedStaffs || [],
						updatedAt: Timestamp.now()
					});
				}
			});

			try {
				await fetchWithTimeout(batch.commit(), undefined, 2500);
				console.log('[SaveShifts] Successfully committed confirmed_shifts to Firestore.');
			} catch (commitErr) {
				console.warn('[AutoSave] Firestore batch commit bypassed or failed:', commitErr);
			}

			// 固定設定（UNICES/FS日程）も同時に一括保存
			saveUnicesAndFsSettings().catch(() => {});

			// バックグラウンドで Notion バックアップを並行トリガー (オフライン時は即時完了)
			if (typeof window !== 'undefined' && navigator.onLine) {
				isSyncingNotion = true;
				Promise.all(
					Object.values(monthlyConfirmedShifts).map((shift) => {
						if (shift && shift.slots) {
							const hasAssignments = Object.values(shift.slots).some((arr) => arr && arr.length > 0);
							if (hasAssignments) {
								return backupToNotion(shift);
							}
						}
						return Promise.resolve(true);
					})
				).finally(() => {
					isSyncingNotion = false;
					console.log('Notion month backup task finished.');
				});
			}

			isSavedToast = true;
			setTimeout(() => {
				isSavedToast = false;
			}, 4000);
		} catch (err) {
			console.error('Error saving all monthly shifts:', err);
			if (!silent) alert('保存中にエラーが発生しました。');
		} finally {
			if (!silent) isLoading = false;
		}
	}

	// スタッフ設定（時給・目標希望月収）の保存
	async function saveAllStaffDetails() {
		try {
			for (const s of staffs) {
				await saveStaffDetails(s);
			}
			isStaffSavedToast = true;
			setTimeout(() => {
				isStaffSavedToast = false;
			}, 3000);
		} catch (err) {
			console.error('Error saving staff details:', err);
		}
	}

	// UNICES & FS日程の永続化
	async function saveUnicesAndFsSettings() {
		try {
			const docId = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
			const docRef = doc(db, 'system_matrix_settings', docId);
			await setDoc(
				docRef,
				{
					unicesEvents: unicesEventsByDate || {},
					fsDays: fsDaysByDate || {},
					updatedAt: Timestamp.now()
				},
				{ merge: true }
			);
			console.log('[Matrix Settings] Successfully saved UNICES & FS schedule to Firestore.');
		} catch (e) {
			console.error('Failed to save matrix settings:', e);
		}
	}

	// イベント日設定の保存
	async function saveEventDatesSettings() {
		try {
			const docRef = doc(db, 'settings', 'global');
			await setDoc(
				docRef,
				{
					eventDates,
					updatedAt: Timestamp.now()
				},
				{ merge: true }
			);
			console.log('[Settings] Successfully saved eventDates to settings/global in Firestore.');
		} catch (e) {
			console.error('Failed to save eventDates settings:', e);
			alert('イベント日設定の保存に失敗しました。');
		}
	}

	// イベント日のトグル処理
	function toggleEventDate(dateStr: string) {
		if (eventDates.includes(dateStr)) {
			eventDates = eventDates.filter((d) => d !== dateStr);
		} else {
			eventDates = [...eventDates, dateStr];
		}
		saveEventDatesSettings();
	}

	// 特定の日付のシフトのみを自動即時保存するヘルパー
	async function saveSingleDailyShift(dateStr: string) {
		const shift = monthlyConfirmedShifts[dateStr];
		if (shift) {
			// 1. LocalStorage キャッシュへ即時保存 (0ms 復元保護)
			saveConfirmedShiftsToLocalCache(currentYear, currentMonth, monthlyConfirmedShifts);

			// 2. Firestore confirmed_shifts ＆ shifts/${targetYearMonth} へ即時永続保存
			try {
				const docRef = doc(db, 'confirmed_shifts', dateStr);
				await setDoc(docRef, {
					date: shift.date,
					slots: shift.slots || {},
					updatedAt: Timestamp.now()
				});

				const targetYearMonth = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;
				await setDoc(
					doc(db, 'shifts', targetYearMonth),
					{
						yearMonth: targetYearMonth,
						assignments: monthlyConfirmedShifts,
						updatedAt: Timestamp.now()
					},
					{ merge: true }
				);

				// バックグラウンドで Notion に同期 (awaitせず実行)
				if (shift.slots) {
					const hasAssignments = Object.values(shift.slots).some((arr) => arr && arr.length > 0);
					if (hasAssignments) {
						backupToNotion(shift).catch((err) => {
							console.warn('[Notion Sync] Daily background backup failed:', err);
						});
					}
				}
			} catch (e) {
				console.error('Failed to auto-save daily shift:', e);
			}
		}
	}

	// デバッグ用：スタッフのダミー希望データをランダム生成してFirestoreに保存
	async function generateDummyWishes() {
		isLoading = true;
		try {
			const year = currentYear;
			const month = currentMonth;
			const lastDay = new Date(year, month, 0).getDate();

			const batch = writeBatch(db);

			// バラバラな希望時間パターン
			const specificTimes = [
				{ start: '09:45', end: '13:00' },
				{ start: '12:00', end: '17:00' },
				{ start: '17:00', end: '20:15' },
				{ start: '10:00', end: '12:00' }, // 2時間 (短時間ペナルティ対象)
				{ start: '18:00', end: '20:00' }, // 2時間 (短時間ペナルティ対象)
				{ start: '09:45', end: '15:00' }, // 前半
				{ start: '15:00', end: '20:15' }, // 後半
				{ start: '11:15', end: '16:45' }, // 不規則
				{ start: '13:00', end: '18:00' }, // 不規則
				{ start: '09:45', end: '20:15' } // 終日特定
			];

			for (const s of staffs) {
				const wishes: { [dateStr: string]: any } = {};

				for (let d = 1; d <= lastDay; d++) {
					const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
					const rand = Math.random();

					let wishType: 'free' | 'ng' | 'specific' = 'free';
					let startTime = '';
					let endTime = '';

					if (rand < 0.15) {
						// 15% の確率で休み希望
						wishType = 'ng';
					} else if (rand < 0.45) {
						// 30% の確率でおまかせ（free）
						wishType = 'free';
						startTime = '09:45';
						endTime = '20:15';
					} else {
						// 55% の確率で特定時間（specific）
						wishType = 'specific';
						const timePattern = specificTimes[Math.floor(Math.random() * specificTimes.length)];
						startTime = timePattern.start;
						endTime = timePattern.end;
					}

					wishes[dateStr] = {
						date: dateStr,
						type: wishType,
						startTime,
						endTime,
						isOverridden: false,
						isSubmitted: true
					};
				}

				const submittalId = `${s.id}_${year}_${String(month).padStart(2, '0')}`;
				const submittalRef = doc(db, 'submittals', submittalId);
				batch.set(submittalRef, {
					userId: s.id,
					year,
					month,
					wishes,
					isSubmitted: true,
					isUnlocked: false,
					updatedAt: Timestamp.now()
				});
			}

			await batch.commit();
			alert('ダミー希望データをバラバラに生成し、Firestoreへ保存しました！');
			await loadMonthData();
		} catch (e) {
			console.error('Failed to generate dummy wishes:', e);
			alert('ダミー希望データの生成に失敗しました。');
		} finally {
			isLoading = false;
		}
	}

	// 空き枠テキストの生成用
	function getLineEmptySlotsText(
		year: number,
		month: number,
		shiftsMap: { [dateStr: string]: DailyShift }
	): string {
		let text =
			'お疲れ様です！シフトの原案を作成しました。\n以下の空き枠に入れる人がいれば、アプリから追加でスタンプ入力をお願いします！\n\n';
		let emptySlotsCount = 0;

		const dayOfWeekNames = ['日', '月', '火', '水', '木', '金', '土'];

		// 1日から15日までループ
		for (let d = 1; d <= 15; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const dayShift = shiftsMap[dateStr];

			const jsDate = new Date(year, month - 1, d);
			const dayName = dayOfWeekNames[jsDate.getDay()];
			const dateLabel = `${month}/${d}(${dayName})`; // 例: "5/3(日)"

			// 各スロットの欠乏状態をリスト化
			const slotDeficiencies = TIME_SLOTS.map((slot) => {
				const assignments = dayShift?.slots?.[slot] || [];
				const actual = assignments.length;
				const hasUnices = assignments.some((a) => a.area === 'unices');
				const required = slot === '09:45' ? 1 : hasUnices ? 3 : 2;
				const def = Math.max(0, required - actual);
				return { slot, def };
			});

			// 連続する欠乏ブロックを抽出
			let i = 0;
			while (i < slotDeficiencies.length) {
				if (slotDeficiencies[i].def > 0) {
					const startIdx = i;
					const currentDef = slotDeficiencies[i].def;

					// 同じ欠乏数で連続している区間を探す
					while (i < slotDeficiencies.length && slotDeficiencies[i].def === currentDef) {
						i++;
					}
					const endIdx = i - 1;

					// 開始時刻と終了時刻を決定
					const startTimeStr = slotDeficiencies[startIdx].slot;
					// 終了時刻は、最後のスロットの15分後
					const endSlotStr = slotDeficiencies[endIdx].slot;
					const [eh, em] = endSlotStr.split(':').map(Number);
					let endMin = em + 15;
					let endHr = eh;
					if (endMin >= 60) {
						endMin -= 60;
						endHr += 1;
					}
					const endTimeStr = `${String(endHr).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

					text += `・${dateLabel} ${startTimeStr}-${endTimeStr} (あと${currentDef}名)\n`;
					emptySlotsCount++;
				} else {
					i++;
				}
			}
		}

		if (emptySlotsCount === 0) {
			return 'お疲れ様としてシフトの原案を作成しました。\n現在、1日〜15日までの空き枠はありません！';
		}

		return text;
	}

	// 空き枠コピー（LINE通知テキスト）の生成
	async function copyLineEmptySlotsText() {
		try {
			const text = getLineEmptySlotsText(currentYear, currentMonth, monthlyConfirmedShifts);
			await navigator.clipboard.writeText(text);

			isCopiedToast = true;
			setTimeout(() => {
				isCopiedToast = false;
			}, 3000);
		} catch (err) {
			console.error('Failed to copy LINE text:', err);
			alert('コピーに失敗しました。');
		}
	}

	// 給与ステータスのクラス選定
	function getWageStatus(expected: number, s: Staff): { label: string; class: string } {
		const targetIncome = s.target_monthly_income || 50000;
		const absoluteLimit = s.max_monthly_income || (s.role === 'employee' ? 80000 : 70000);

		if (expected < targetIncome) {
			return {
				label: '目標未満 ⚠️',
				class: 'bg-amber-50 text-amber-700 border-amber-250 font-bold'
			};
		} else if (expected > absoluteLimit) {
			return {
				label: '上限超過 🚨',
				class: 'bg-rose-50 text-rose-700 border-rose-250 font-bold animate-pulse'
			};
		} else {
			return {
				label: '適正 ✅',
				class: 'bg-emerald-50 text-emerald-700 border-emerald-250 font-semibold'
			};
		}
	}

	// 初期化ロード
	onMount(async () => {
		await loadMonthData();
	});
</script>

<svelte:window onclick={handleWindowClick} />

<div
	class="min-h-screen bg-slate-50 pb-32 font-sans text-slate-800 transition-colors duration-300 ease-in-out"
>
	<div class="mx-auto max-w-7xl space-y-8 px-4 py-8">
		<!-- ヘッダー -->
		<header
			class="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-center"
		>
			<div class="space-y-1">
				<div class="flex items-center gap-2">
					<a
						href="/"
						class="bg-slate-150/80 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/70 px-3 py-1 text-[10px] font-bold text-slate-600 shadow-sm transition-all duration-300 hover:bg-slate-200/90 hover:text-slate-800"
					>
						<span>← ホームへ戻る</span>
					</a>
				</div>
				<div class="flex items-center gap-3">
					<h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
						<span>IPO Shift - 月間マトリクス・パズル調整</span>
					</h1>
					{#if isStaging}
						<span class="mt-2 inline-flex animate-pulse items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-extrabold text-amber-700 shadow-xs">
							<span>📝</span> 仮プレビュー (未確定)
						</span>
					{:else if isPublished}
						<span class="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-extrabold text-emerald-700 shadow-xs">
							<span>✅</span> 確定・全端末公開済み
						</span>
					{/if}
				</div>
				<p class="text-xs text-slate-500">
					情報を削ぎ落とした、1ヶ月全体を俯瞰して調整できるシフト決定用クリーン画面
				</p>
			</div>

			<!-- コントロールバー -->
			<div class="flex flex-wrap items-center gap-3">
				<!-- タブ切り替え -->
				<div
					class="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs shadow-sm select-none"
				>
					<button
						type="button"
						onclick={() => (activeTab = 'puzzle')}
						class="cursor-pointer rounded-full px-4 py-1.5 text-[10px] font-bold transition-all duration-300 {activeTab ===
						'puzzle'
							? 'bg-indigo-600 text-white shadow-sm'
							: 'text-slate-500 hover:text-slate-800'}"
					>
						🧩 パズル調整
					</button>
					<button
						type="button"
						onclick={() => (activeTab = 'settings')}
						class="cursor-pointer rounded-full px-4 py-1.5 text-[10px] font-bold transition-all duration-300 {activeTab ===
						'settings'
							? 'bg-indigo-600 text-white shadow-sm'
							: 'text-slate-500 hover:text-slate-800'}"
					>
						⚙️ 各種設定
					</button>
				</div>

				<!-- 月切り替えナビ -->
				<div
					class="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm"
				>
					<button
						type="button"
						onclick={handlePrevMonth}
						class="flex cursor-pointer items-center justify-center rounded-full px-2 py-0.5 transition hover:bg-slate-100"
						>◀</button
					>
					<span>{currentYear}年 {currentMonth}月</span>
					<button
						type="button"
						onclick={handleNextMonth}
						class="flex cursor-pointer items-center justify-center rounded-full px-2 py-0.5 transition hover:bg-slate-100"
						>▶</button
					>
				</div>

				<button
					type="button"
					onclick={copyLineEmptySlotsText}
					class="hover:bg-amber-450 flex cursor-pointer items-center gap-1.5 rounded-full bg-amber-500 px-4 py-2.5 font-sans text-xs font-bold text-white shadow-sm transition-all duration-300 ease-in-out hover:scale-[1.03] active:scale-95"
				>
					💬 空き枠コピー
				</button>

				<button
					type="button"
					onclick={handlePublishConfirmedShifts}
					disabled={isLoading}
					class="flex cursor-pointer items-center gap-2 rounded-full bg-gradient-to-r from-amber-500 via-emerald-600 to-indigo-600 px-6 py-2.5 font-sans text-xs font-black text-white shadow-md transition-all duration-300 hover:scale-[1.03] hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{#if isLoading}
						<span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
						<span>処理中...</span>
					{:else}
						<span>⚡️ シフトを確定してスタッフへ送信（公開）</span>
					{/if}
				</button>
			</div>
		</header>

		<!-- メインコンテンツ -->
		{#if activeTab === 'puzzle'}
			<!-- スタッフ希望提出状況 ＆ リアルタイム同期ダッシュボード -->
			<section class="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-xs">
				<div class="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
					<div class="flex items-center gap-2">
						<span class="text-base">📋</span>
						<h2 class="text-sm font-bold text-slate-900">スタッフ希望提出状況・ダッシュボード (リアルタイム同期)</h2>
						<span class="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-extrabold text-indigo-700">
							対象月: {currentYear}年{currentMonth}月
						</span>
					</div>
					<div class="flex items-center gap-2 text-xs font-semibold text-slate-500">
						<span class="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
							<span>✅</span> 提出済み ({submittedCount}名)
						</span>
						<span class="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700">
							<span>⏳</span> 未提出・デフォルト適用 ({unsubmittedCount}名)
						</span>
					</div>
				</div>

				<!-- 17名スタッフカードグリッド -->
				<div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{#each staffs as s (s.id)}
						{@const wishDoc = staffWishesDocMap[s.id]}
						{@const isSub = wishDoc?.isSubmitted || false}
						{@const offList = wishDoc?.offDates || s.offDates || []}
						{@const policy = wishDoc?.dayPreferencePolicy || s.dayPreferencePolicy || 'ANY'}
						<div class="flex flex-col justify-between rounded-2xl border p-3.5 transition-all duration-200 hover:shadow-xs {isSub ? 'border-emerald-200/80 bg-emerald-50/20' : 'border-slate-200/60 bg-slate-50/40'}">
							<div>
								<div class="flex items-center justify-between gap-2">
									<div class="flex min-w-0 items-center gap-1.5">
										<span class="truncate text-xs font-extrabold text-slate-800">{s.name}</span>
										{#if s.role === 'employee'}
											<span class="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">社員</span>
										{/if}
									</div>
									{#if isSub}
										<span class="shrink-0 rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-[9px] font-extrabold text-emerald-800">
											✅ 提出済み
										</span>
									{:else}
										<span class="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold text-amber-700">
											⏳ デフォルト
										</span>
									{/if}
								</div>

								<div class="mt-2.5 space-y-1.5 text-[10px] font-semibold text-slate-600">
									<div class="flex items-center justify-between">
										<span class="text-slate-400">希望月収 / 上限:</span>
										<span class="font-bold text-slate-800">
											{((wishDoc?.target_monthly_income || s.target_monthly_income || 50000) / 10000).toFixed(1)}万 / {((wishDoc?.max_monthly_income || s.max_monthly_income || 80000) / 10000).toFixed(1)}万円
										</span>
									</div>
									<div class="flex items-center justify-between">
										<span class="text-slate-400">週希望 / 曜日方針:</span>
										<div class="flex items-center gap-1">
											<span class="font-bold text-slate-800">週{wishDoc?.preferredDaysPerWeek ?? s.preferredDaysPerWeek ?? 0}日</span>
											<span class="rounded px-1.5 py-0.5 text-[9px] font-extrabold text-white {policy === 'FIXED' ? 'bg-indigo-600' : policy === 'ROTATING' ? 'bg-emerald-600' : 'bg-slate-400'}">
												{policy === 'FIXED' ? '固定' : policy === 'ROTATING' ? '分散' : '自由'}
											</span>
										</div>
									</div>
								</div>
							</div>

							<!-- NG日 (休み希望) タグ一覧 -->
							<div class="mt-3 border-t border-slate-100 pt-2 text-[10px]">
								<span class="font-bold text-slate-400">休み希望 ({offList.length}日):</span>
								{#if offList.length > 0}
									<div class="mt-1 flex max-h-12 flex-wrap gap-1 overflow-y-auto pr-0.5">
										{#each offList as dStr}
											<span class="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
												{dStr.split('-').slice(1).join('/')}
											</span>
										{/each}
									</div>
								{:else}
									<span class="ml-1 font-normal text-slate-400">なし (全日可能)</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</section>

			<!-- 「🧩 パズル調整」メイン画面 -->
			<div class="grid grid-cols-1 gap-6 lg:grid-cols-4">
				<!-- 左側：ツイン月間カレンダー (コピールーム・コワーキング / UNICES) -->
				<div class="space-y-8 font-sans lg:col-span-3">
					<!-- カフェカレンダー -->
					<section
						class="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span>☕️</span>
								カフェ・コワーキング シフトパズル（常時2名）
							</h2>
							<div class="flex items-center gap-2">
								<span
									class="inline-block h-3.5 w-3.5 rounded border border-dashed border-rose-300 bg-rose-50"
								></span>
								<span class="text-[9px] font-bold text-slate-400"
									>薄赤破線: スタッフ不足（常時2名未満）</span
								>
							</div>
						</div>

						<!-- 曜日のヘッダー -->
						<div
							class="mb-2 grid grid-cols-7 gap-2 text-center font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase"
						>
							<div>日</div>
							<div>月</div>
							<div>火</div>
							<div>水</div>
							<div>木</div>
							<div>金</div>
							<div>土</div>
						</div>

						<!-- 月カレンダーグリッド -->
						<div class="grid grid-cols-7 gap-2.5">
							{#each calendarDays as cell}
								<div
									role="button"
									tabindex="0"
									onclick={(e) => openPopover(e, cell.dateStr, 'cafe')}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') openPopover(e, cell.dateStr, 'cafe');
									}}
									class="relative flex min-h-[90px] cursor-pointer flex-col justify-between rounded-2xl border p-2 text-left transition-all duration-300 select-none
                    {cell.isPadding
										? 'border-slate-100 bg-slate-50/50 opacity-40 hover:bg-slate-50'
										: 'hover:border-slate-350 border-slate-200/80 bg-white hover:bg-slate-50/20'}
                    {cell.isCafeShortage && !cell.isPadding
										? 'border-dashed border-rose-300 bg-rose-50/35 shadow-[0_0_12px_rgba(244,63,94,0.02)] hover:bg-rose-50/60'
										: ''}
                  "
								>
									<span
										class="text-[9px] font-bold {cell.isPadding
											? 'text-slate-400'
											: 'text-slate-650'}">{cell.dayNum}</span
									>

									<!-- バッジ一覧 -->
									<div class="mt-2 flex flex-1 flex-col justify-end space-y-1.5">
										{#each cell.cafeStaffs as staff}
											<div
												class="border-emerald-150/70 group relative flex items-center justify-between rounded-lg border bg-emerald-50 px-2 py-0.5 text-[8px] font-extrabold tracking-wider text-emerald-800 shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition hover:scale-[1.01]"
											>
												<span class="truncate">{staff.name}</span>
												<div class="flex items-center gap-1">
													<span class="text-[7px] font-bold text-emerald-600/80 group-hover:hidden"
														>{staff.range}</span
													>
													<button
														type="button"
														onclick={(e) =>
															removeStaffAssignmentDirectly(e, cell.dateStr, staff.id, 'cafe')}
														class="hidden h-3 w-3 cursor-pointer items-center justify-center rounded-full border-none bg-rose-100 text-[8px] font-extrabold text-rose-700 transition group-hover:flex hover:bg-rose-200"
														title="このシフトを削除"
													>
														×
													</button>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</section>

					<!-- UNICESカレンダー -->
					<section
						class="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span>🌐</span>
								UNICES シフトパズル（開催中1名）
							</h2>
							<div class="flex items-center gap-2">
								<span class="inline-block h-3.5 w-3.5 rounded border border-indigo-200 bg-indigo-50"
								></span>
								<span class="text-[9px] font-bold text-slate-400">開催日のみスライド配置します</span
								>
							</div>
						</div>

						<!-- 曜日のヘッダー -->
						<div
							class="mb-2 grid grid-cols-7 gap-2 text-center font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase"
						>
							<div>日</div>
							<div>月</div>
							<div>火</div>
							<div>水</div>
							<div>木</div>
							<div>金</div>
							<div>土</div>
						</div>

						<!-- 月カレンダーグリッド -->
						<div class="grid grid-cols-7 gap-2.5">
							{#each calendarDays as cell}
								{@const hasEvent = unicesEventsByDate[cell.dateStr]?.active === true}

								<div
									role="button"
									tabindex="0"
									onclick={(e) => openPopover(e, cell.dateStr, 'unices')}
									onkeydown={(e) => {
										if (e.key === 'Enter' || e.key === ' ') openPopover(e, cell.dateStr, 'unices');
									}}
									class="relative flex min-h-[90px] cursor-pointer flex-col justify-between rounded-2xl border p-2 text-left transition-all duration-300 select-none
                    {cell.isPadding
										? 'border-slate-100 bg-slate-50/50 opacity-40 hover:bg-slate-50'
										: 'hover:border-slate-350 border-slate-200/80 bg-white hover:bg-slate-50/20'}
                    {hasEvent && !cell.isPadding ? 'border-indigo-200/80 bg-indigo-50/10' : ''}
                    {cell.isUnicesShortage && !cell.isPadding
										? 'border-dashed border-rose-300 bg-rose-50/35 shadow-[0_0_12px_rgba(244,63,94,0.02)] hover:bg-rose-50/60'
										: ''}
                  "
								>
									<div class="flex items-center justify-between">
										<span
											class="text-[9px] font-bold {cell.isPadding
												? 'text-slate-400'
												: 'text-slate-650'}">{cell.dayNum}</span
										>
										{#if hasEvent && !cell.isPadding}
											<span
												class="py-0.2 text-indigo-750 origin-right scale-90 rounded bg-indigo-100 px-1 text-[7px] font-bold"
												>EVENT</span
											>
										{/if}
									</div>

									<!-- バッジ一覧 -->
									<div class="mt-2 flex flex-1 flex-col justify-end space-y-1.5">
										{#each cell.unicesStaffs as staff}
											<div
												class="border-indigo-150/70 text-indigo-850 group relative flex items-center justify-between rounded-lg border bg-indigo-50 px-2 py-0.5 text-[8px] font-extrabold tracking-wider shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition hover:scale-[1.01]"
											>
												<span class="truncate">{staff.name}</span>
												<div class="flex items-center gap-1">
													<span class="text-[7px] font-bold text-indigo-600/80 group-hover:hidden"
														>{staff.range}</span
													>
													<button
														type="button"
														onclick={(e) =>
															removeStaffAssignmentDirectly(e, cell.dateStr, staff.id, 'unices')}
														class="hidden h-3 w-3 cursor-pointer items-center justify-center rounded-full border-none bg-rose-100 text-[8px] font-extrabold text-rose-700 transition group-hover:flex hover:bg-rose-200"
														title="このシフトを削除"
													>
														×
													</button>
												</div>
											</div>
										{/each}
									</div>
								</div>
							{/each}
						</div>
					</section>
				</div>

				<!-- 右側：リアルタイム給与＆優先度アシストサイドバー -->
				<div class="space-y-6 lg:col-span-1">
					<section
						class="sticky top-6 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="mb-5 border-b border-slate-100 pb-3">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span class="inline-block h-2.5 w-2.5 rounded-full bg-teal-500"></span>
								👥 給与・優先度アシスト
							</h2>
							<p class="mt-1 text-[9px] font-bold tracking-wider text-slate-400 uppercase">
								当月の合計稼働見込み
							</p>
						</div>

						<!-- 自動生成コントローラー -->
						<div class="mb-6 space-y-3 rounded-2xl border border-slate-200/60 bg-slate-50 p-4">
							<span class="text-slate-550 block font-sans text-[10px] font-bold"
								>⚡ 自動生成（AI最適マッピング）</span
							>

							<!-- 考慮度選択 -->
							<div
								class="flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5 text-xs shadow-xs select-none"
							>
								<button
									type="button"
									onclick={() => changeIncomeWeight('low')}
									class="flex-1 cursor-pointer rounded-full py-1 text-center text-[8px] font-bold transition-all duration-300 {considerIncomeWeight ===
									'low'
										? 'bg-teal-600 text-white shadow-xs'
										: 'text-slate-500 hover:text-slate-800'}"
								>
									⚖️ バランス
								</button>
								<button
									type="button"
									onclick={() => changeIncomeWeight('high')}
									class="flex-1 cursor-pointer rounded-full py-1 text-center text-[8px] font-bold transition-all duration-300 {considerIncomeWeight ===
									'high'
										? 'bg-indigo-600 text-white shadow-xs'
										: 'text-slate-500 hover:text-slate-800'}"
								>
									🎯 希望重視
								</button>
								<button
									type="button"
									onclick={() => changeIncomeWeight('none')}
									class="flex-1 cursor-pointer rounded-full py-1 text-center text-[8px] font-bold transition-all duration-300 {considerIncomeWeight ===
									'none'
										? 'bg-slate-200 text-slate-700 shadow-xs'
										: 'text-slate-400 hover:text-slate-600'}"
								>
									❌ オフ
								</button>
							</div>

							{#if pendingShiftRequests.length > 0}
								<button
									type="button"
									onclick={() => (isRequestModalOpen = true)}
									class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 font-sans text-[10px] font-extrabold text-white shadow-md transition-all duration-300 hover:bg-rose-700 hover:scale-[1.02] active:scale-95 animate-bounce"
								>
									<span class="inline-block h-2 w-2 rounded-full bg-white animate-ping"></span>
									<span>🔴 修正依頼 ({pendingShiftRequests.length}件)</span>
								</button>
							{/if}

							<button
								type="button"
								onclick={triggerMonthlyAutoGenerate}
								class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-full bg-slate-900 px-4 py-2 font-sans text-[10px] font-bold text-white shadow-xs transition-all duration-300 hover:scale-[1.02] hover:bg-slate-800 active:scale-95"
							>
								<span>⚡ 月間シフトを一括自動生成</span>
							</button>

							<!-- デバッグ用：ダミー希望一括生成ボタン -->
							<button
								type="button"
								onclick={generateDummyWishes}
								class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-full border border-dashed border-amber-300 bg-amber-50 px-4 py-2 font-sans text-[10px] font-bold text-amber-700 transition-all duration-300 hover:bg-amber-100 active:scale-95"
							>
								<span>🎲 デバッグ：バラバラな希望希望を生成(Firestore保存)</span>
							</button>
						</div>

						<!-- スタッフ進捗リスト -->
						<div class="max-h-[480px] space-y-4 overflow-y-auto pr-1">
							{#each staffs as s}
								{@const expected = staffExpectedWages[s.id] || 0}
								{@const hours = staffTotalHours[s.id] || 0}
								{@const status = getWageStatus(expected, s)}

								{@const targetIncome = s.target_monthly_income || 50000}
								{@const percent =
									targetIncome > 0 ? Math.min(100, Math.round((expected / targetIncome) * 100)) : 0}

								<div
									class="space-y-2.5 rounded-2xl border border-slate-200/50 bg-slate-50 p-3 shadow-[0_1px_3px_rgba(0,0,0,0.01)] transition duration-300 hover:bg-white"
								>
									<!-- スタッフ名と状況バッジ -->
									<div class="flex items-center justify-between font-sans">
										<div>
											<span class="text-xs font-bold text-slate-800">{s.name}</span>
											<span class="mt-0.5 block font-sans text-[8px] text-slate-400"
												>当月合計: {hours.toFixed(1)}時間</span
											>
										</div>
										<span
											class="rounded-full border px-1.5 py-0.5 text-[8px] font-extrabold {status.class}"
										>
											{status.label}
										</span>
									</div>

									<!-- 金額インジケーター -->
									<div
										class="flex items-center justify-between rounded-xl border border-slate-100/80 bg-white px-2.5 py-1.5 font-sans text-[9px]"
									>
										<div>
											<span class="block origin-left scale-90 font-medium text-slate-400"
												>見込み額</span
											>
											<span class="font-extrabold text-slate-900"
												>{expected.toLocaleString()}円</span
											>
										</div>
										<div class="text-right">
											<span class="block origin-right scale-90 font-medium text-slate-400"
												>希望 / 上限</span
											>
											<span class="font-semibold text-slate-600">
												{targetIncome.toLocaleString()}円 / {(
													s.max_monthly_income || (s.role === 'employee' ? 80000 : 70000)
												).toLocaleString()}円
											</span>
										</div>
									</div>

									<!-- プログレスバー -->
									{#if targetIncome > 0}
										<div class="space-y-1 font-sans">
											<div
												class="text-slate-455 flex origin-left scale-90 justify-between text-[8px] font-bold tracking-wider uppercase"
											>
												<span>進捗率</span>
												<span>{percent}%</span>
											</div>
											<div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/50">
												<div
													class="h-full rounded-full transition-all duration-500
                            {status.label.includes('不足')
														? 'bg-amber-400'
														: status.label.includes('超過') || status.label.includes('過剰')
															? 'animate-pulse bg-rose-500'
															: 'bg-emerald-500'}"
													style="width: {percent}%"
												></div>
											</div>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				</div>
			</div>
		{:else}
			<!-- 「⚙️ 各種設定（詳細設定分離タブ）」画面 -->
			<div class="grid grid-cols-1 gap-6 font-sans lg:grid-cols-3">
				<!-- 左側：UNICESイベント時間設定 (2カラム分) -->
				<div class="space-y-6 lg:col-span-2">
					<section
						class="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="mb-6 border-b border-slate-100 pb-3">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span>🌐</span>
								UNICES 開催日 ＆ 時間帯管理
							</h2>
							<p class="mt-1 text-[10px] text-slate-400">
								選択された月の全日付のUNICES開催の有無と時間を直接設定します。
							</p>
						</div>

						<div
							class="grid max-h-[550px] grid-cols-1 gap-4 overflow-y-auto pr-1 sm:grid-cols-2 md:grid-cols-3"
						>
							{#each calendarDays as cell}
								{#if !cell.isPadding}
									{@const event = unicesEventsByDate[cell.dateStr]}
									{#if event}
										<div
											class="space-y-3 rounded-2xl border border-slate-200/60 bg-slate-50 p-3.5 transition duration-200 hover:bg-white hover:shadow-xs"
										>
											<div class="flex items-center justify-between">
												<span class="text-xs font-bold text-slate-700"
													>{cell.dayNum}日 ({['日', '月', '火', '水', '木', '金', '土'][
														cell.dayOfWeek
													]})</span
												>

												<!-- 有効トグル -->
												<label class="relative inline-flex cursor-pointer items-center select-none">
													<input
														type="checkbox"
														bind:checked={event.active}
														onchange={saveUnicesAndFsSettings}
														class="peer sr-only"
													/>
													<div
														class="bg-slate-250 peer h-4 w-7 rounded-full peer-checked:bg-indigo-600 peer-focus:outline-none after:absolute after:top-[2px] after:left-[2px] after:h-3 after:w-3 after:rounded-full after:border after:border-slate-300 after:bg-white after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white"
													></div>
												</label>
											</div>

											{#if event.active}
												<div class="grid grid-cols-2 gap-2 text-[10px]">
													<div>
														<span class="mb-0.5 block origin-left scale-90 text-slate-400"
															>開始</span
														>
														<input
															type="time"
															bind:value={event.startTime}
															onchange={saveUnicesAndFsSettings}
															class="focus:border-slate-355 w-full rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-bold text-slate-700 focus:outline-none"
														/>
													</div>
													<div>
														<span class="mb-0.5 block origin-left scale-90 text-slate-400"
															>終了</span
														>
														<input
															type="time"
															bind:value={event.endTime}
															onchange={saveUnicesAndFsSettings}
															class="focus:border-slate-355 w-full rounded-md border border-slate-200 bg-white px-1.5 py-0.5 font-bold text-slate-700 focus:outline-none"
														/>
													</div>
												</div>
											{:else}
												<span
													class="block rounded-lg bg-slate-100 py-2 text-center font-sans text-[9px] font-semibold text-slate-400 italic"
													>開催予定なし</span
												>
											{/if}
										</div>
									{/if}
								{/if}
							{/each}
						</div>
					</section>

					<!-- イベント日（人員増枠対象日）設定セクション -->
					<section
						class="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="mb-6 border-b border-slate-100 pb-3">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span>✨</span>
								イベント日設定（特定日の人員増枠 +1名）
							</h2>
							<p class="mt-1 text-[10px] text-slate-400">
								イベント日を選択してください。登録された日付は、カフェ枠（CW）やフリースクール枠（FS）の必要人数が自動的に <strong>+1名</strong> 増枠されます。
							</p>
						</div>

						<!-- カレンダー形式のトグルUI（プレミアムスタイル） -->
						<div class="grid grid-cols-7 gap-2 text-center font-mono text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">
							<div>日</div>
							<div>月</div>
							<div>火</div>
							<div>水</div>
							<div>木</div>
							<div>金</div>
							<div>土</div>
						</div>

						<div class="grid grid-cols-7 gap-2">
							{#each calendarDays as cell}
								{@const isSelected = eventDates.includes(cell.dateStr)}
								<button
									type="button"
									disabled={cell.isPadding}
									onclick={() => toggleEventDate(cell.dateStr)}
									class="relative flex min-h-[50px] flex-col items-center justify-center rounded-xl border p-2 transition-all duration-300 select-none cursor-pointer
										{cell.isPadding
											? 'border-slate-100 bg-slate-50/20 opacity-30 cursor-not-allowed'
											: isSelected
												? 'border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 text-amber-700 shadow-sm font-extrabold hover:brightness-95'
												: 'border-slate-250 bg-white text-slate-600 hover:border-slate-350 hover:bg-slate-50'}"
								>
									<span class="text-xs">{cell.dayNum}</span>
									{#if isSelected && !cell.isPadding}
										<span class="mt-1 text-[7px] font-extrabold tracking-wider bg-amber-500 text-white rounded px-1 scale-90">+1名</span>
									{/if}
								</button>
							{/each}
						</div>
					</section>
				</div>

				<!-- 右側：スタッフ詳細目標設定 (1カラム) -->
				<div class="lg:col-span-1">
					<section
						class="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.015)]"
					>
						<div class="border-b border-slate-100 pb-3">
							<h2 class="flex items-center gap-2 text-sm font-bold text-slate-800">
								<span>👥</span>
								スタッフ時給・希望月収設定
							</h2>
							<p class="mt-1 text-[10px] text-slate-400">
								スタッフごとの基本時給と目標とする月給の範囲を管理します。
							</p>
						</div>

						<div class="max-h-[480px] space-y-4 overflow-y-auto pr-1">
							{#each staffs as s}
								<div class="space-y-3 rounded-2xl border border-slate-200/60 bg-slate-50 p-3.5">
									<div class="flex items-center justify-between">
										<span class="text-xs font-bold text-slate-800">{s.name}</span>
										<span
											class="rounded-full px-2 py-0.5 text-[8px] font-bold
                      {s.role === 'employee'
												? 'text-indigo-650 border border-indigo-100 bg-indigo-50'
												: s.role === 'adult'
													? 'border border-teal-100 bg-teal-50 text-teal-600'
													: 'border border-rose-100 bg-rose-50 text-rose-600'}"
										>
											{s.role === 'employee' ? '社員' : s.role === 'adult' ? '成人' : '未成年'}
										</span>
									</div>

									<div class="grid grid-cols-3 gap-2 text-[10px] font-bold">
										<div>
											<span class="mb-0.5 block origin-left scale-90 text-slate-400">時給 (円)</span
											>
											<input
												type="number"
												bind:value={s.hourlyWage}
												class="focus:border-slate-350 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
											/>
										</div>
										<div>
											<span class="mb-0.5 block origin-left scale-90 text-slate-400">希望月収</span>
											<input
												type="number"
												bind:value={s.target_monthly_income}
												class="focus:border-slate-350 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
											/>
										</div>
										<div>
											<span class="mb-0.5 block origin-left scale-90 text-slate-400">絶対上限</span>
											<input
												type="number"
												bind:value={s.max_monthly_income}
												class="focus:border-slate-350 w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 font-bold text-slate-700 focus:outline-none"
											/>
										</div>
									</div>
								</div>
							{/each}
						</div>

						<div class="border-t border-slate-100 pt-4">
							<button
								type="button"
								onclick={saveAllStaffDetails}
								class="flex w-full cursor-pointer items-center justify-center gap-1 rounded-full bg-teal-600 px-4 py-2 font-sans text-xs font-bold text-white shadow-sm transition-all duration-300 hover:scale-[1.02] hover:bg-teal-500 active:scale-95"
							>
								<span>⚙️ スタッフ設定を一括保存</span>
							</button>
						</div>
					</section>
				</div>
			</div>
		{/if}
	</div>

	<!-- 【絶対座標フローティング】タップ時のポップオーバー・コンテキストメニュー -->
	{#if popoverState.isOpen && popoverState.dateStr && popoverState.area}
		{@const dateStr = popoverState.dateStr}
		{@const area = popoverState.area}
		{@const jsDate = parseLocalDate(dateStr)}
		{@const dayOfWeekName = ['日', '月', '火', '水', '木', '金', '土'][jsDate.getDay()]}
		{@const formattedDate = `${jsDate.getMonth() + 1}月${jsDate.getDate()}日 (${dayOfWeekName})`}
		{@const currentCell = calendarDays.find((c) => c.dateStr === dateStr)}
		{@const unassignedList = currentCell?.unassignedStaffs || []}
		{@const assignedList = area === 'cafe' ? currentCell?.cafeStaffs : currentCell?.unicesStaffs}
		{@const isEventDay = eventDates.includes(dateStr)}
		{@const limit = (area === 'cafe' ? 2 : 1) + (area === 'cafe' && isEventDay ? 1 : 0)}

		<div
			role="presentation"
			onclick={(e) => e.stopPropagation()}
			class="animate-in fade-in zoom-in-95 absolute z-40 w-72 rounded-2xl border border-slate-200/80 bg-white/95 p-4 font-sans shadow-[0_12px_40px_rgba(0,0,0,0.08)] backdrop-blur-md duration-200"
			style="left: {popoverState.x}px; top: {popoverState.y}px;"
		>
			<div class="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
				<span class="flex items-center gap-1.5 text-xs font-extrabold text-slate-800">
					<span>{area === 'cafe' ? '☕️' : '🌐'}</span>
					<span>{formattedDate} - {area === 'cafe' ? 'カフェ' : 'UNICES'}</span>
				</span>
				<button
					type="button"
					onclick={() => (popoverState.isOpen = false)}
					class="flex cursor-pointer items-center justify-center p-1 text-xs font-bold text-slate-400 hover:text-slate-600"
				>
					✕
				</button>
			</div>

			<!-- 希望提出者とアサイン操作 -->
			<div class="max-h-60 space-y-2 overflow-y-auto pr-1">
				{#each staffs as s}
					{@const wish = wishesMapByDate[dateStr]?.[s.id]}
					{@const range = getStaffTimeRange(dateStr, s.id, area)}
					{@const isAssigned = range !== ''}

					<div
						class="flex flex-col gap-1.5 rounded-xl p-2 transition duration-200 {isAssigned
							? 'border border-slate-200/60 bg-slate-50 shadow-[0_1px_2px_rgba(0,0,0,0.01)]'
							: 'border border-transparent hover:bg-slate-50/50'}"
					>
						<div
							role="button"
							tabindex="0"
							onclick={() => toggleStaffAssignmentInPopover(s.id)}
							onkeydown={(e) => {
								if (e.key === 'Enter' || e.key === ' ') toggleStaffAssignmentInPopover(s.id);
							}}
							class="flex cursor-pointer items-center justify-between"
						>
							<div class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={isAssigned}
									class="pointer-events-none h-3.5 w-3.5 cursor-pointer rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
									tabindex="-1"
								/>
								<span class="text-xs font-bold text-slate-700">{s.name}</span>
							</div>

							<!-- 希望ステータス -->
							<span
								class="scale-95 rounded-md px-1.5 py-0.5 text-[8px] font-extrabold
                {!wish
									? 'bg-slate-100 text-slate-400'
									: wish.type === 'free'
										? 'border border-emerald-100/50 bg-emerald-50 text-emerald-600'
										: wish.type === 'specific'
											? 'border border-sky-100/50 bg-sky-50 text-sky-600'
											: 'border border-rose-100/50 bg-rose-50 text-rose-500'}
              "
							>
								{!wish
									? '未提出'
									: wish.type === 'free'
										? '終日可'
										: wish.type === 'specific'
											? `${wish.startTime}-${wish.endTime}`
											: '休み'}
							</span>
						</div>

						<!-- 時間直接編集 (アサイン時のみ出現) -->
						{#if isAssigned}
							<div
								class="animate-in slide-in-from-left-2 flex items-center gap-1.5 pl-6 font-sans duration-150"
							>
								<span class="text-[8px] font-bold tracking-wider text-slate-400 uppercase"
									>時間:</span
								>
								<input
									type="text"
									value={range}
									onchange={(e) => handlePopoverTimeChange(s.id, e)}
									placeholder="例: 10:00-15:00"
									class="hover:border-slate-350 w-full rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-extrabold text-slate-800 shadow-xs transition focus:border-indigo-400 focus:outline-none"
								/>
							</div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- あぶれ希望提出者（未配属メンバー）のクイック調整 -->
			{#if unassignedList.length > 0}
				<div class="mt-4 space-y-2 border-t border-slate-200/80 pt-3">
					<span class="block text-[9px] font-extrabold tracking-wider text-slate-500 uppercase">
						📌 あぶれ希望者 ({unassignedList.length}名)
					</span>
					<div class="max-h-36 space-y-1.5 overflow-y-auto pr-0.5">
						{#each unassignedList as u}
							<div
								class="flex items-center justify-between gap-2 rounded-xl border border-slate-200/50 bg-slate-50 p-2 text-[10px]"
							>
								<div class="flex min-w-0 flex-col gap-0.5">
									<span class="truncate font-extrabold text-slate-700">{u.staffName}</span>
									<span class="text-[8px] font-bold text-slate-400">
										{u.role === 'employee' ? '社員' : u.role === 'adult' ? '成人' : '未成年'}
									</span>
								</div>

								<div class="flex shrink-0 items-center gap-1">
									{#if (assignedList?.length || 0) < limit}
										<button
											type="button"
											onclick={() => quickAssignUnassignedStaff(u.staffId, dateStr, area)}
											class="cursor-pointer rounded-lg border-none bg-indigo-600 px-2 py-1 text-[8px] font-extrabold text-white shadow-xs transition-all duration-200 hover:bg-indigo-500"
										>
											⚡️ 配置
										</button>
									{:else}
										{#each assignedList || [] as assigned}
											<button
												type="button"
												onclick={() => swapStaffAssignments(u.staffId, assigned.id, dateStr, area)}
												class="hover:bg-amber-450 cursor-pointer rounded-lg border-none bg-amber-500 px-1.5 py-1 text-[8px] font-extrabold text-white shadow-xs transition-all duration-200"
												title="{assigned.name}と交代"
											>
												🔄 {assigned.name}
											</button>
										{/each}
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- トースト通知群 -->
	{#if isSavedToast}
		<div
			class="animate-in slide-in-from-bottom-4 fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-4 font-sans shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-md duration-300"
		>
			<span class="text-xl">🎉</span>
			<div>
				<p class="text-xs font-bold text-slate-800">月間シフトを確定・保存しました</p>
				<p class="mt-0.5 text-[10px] font-semibold text-slate-400">
					{#if isSyncingNotion}
						<span class="animate-pulse text-indigo-600">🔄 Notion バックアップを実行中...</span>
					{:else}
						<span class="text-emerald-600">✅ Notion バックアップと同期されました（保険）</span>
					{/if}
				</p>
			</div>
		</div>
	{/if}

	{#if isStaffSavedToast}
		<div
			class="animate-in slide-in-from-bottom-4 fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-4 font-sans shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-md duration-300"
		>
			<span class="text-xl">⚙️</span>
			<div>
				<p class="text-xs font-bold text-slate-800">スタッフ設定を保存しました</p>
				<p class="mt-0.5 text-[10px] font-medium text-slate-400">
					データベースに時給・目標希望月収設定が同期されました。
				</p>
			</div>
		</div>
	{/if}

	{#if isLoading}
		<div
			class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-lg animate-in fade-in duration-300"
		>
			<!-- 装飾用ブラーグラデーションバックライト -->
			<div class="absolute w-72 h-72 rounded-full bg-indigo-500/10 blur-[80px]"></div>
			<div class="absolute w-60 h-60 rounded-full bg-pink-500/10 blur-[60px] translate-x-20 translate-y-20"></div>

			<div
				class="relative max-w-sm w-full overflow-hidden rounded-[2rem] border border-slate-200/60 bg-white/95 p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.08)] backdrop-blur-md"
			>
				<!-- アニメーションスピナー -->
				<div class="relative mx-auto flex h-20 w-20 items-center justify-center">
					<div
						class="absolute inset-0 animate-spin rounded-full border-[3px] border-indigo-600 border-r-pink-500 border-b-purple-600 border-l-transparent"
					></div>
					<span class="text-3xl animate-pulse">🤖</span>
				</div>

				<h3 class="mt-6 text-sm font-bold text-slate-900 font-sans">
					⚡ AIが月間シフトを最適化中...
				</h3>
				<p class="mt-3 text-[10px] leading-relaxed text-slate-500 font-sans">
					1スロットずつ順番に進捗率と上限月収をプログラム側で正確に集計・ガードしながら、最もバランスの良いシフトをAIが順次アサインしています。
				</p>
				
				<!-- 簡易的なプログレスアニメーションバー -->
				<div class="mt-6 h-1 w-full bg-slate-100 rounded-full overflow-hidden">
					<div class="h-full w-1/3 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-full animate-progress"></div>
				</div>

				<p class="mt-4 text-[9px] font-bold text-slate-400 font-sans">
					処理には約30秒〜45秒かかります。このままお待ちください。
				</p>
			</div>
		</div>
	{/if}

	{#if isCopiedToast}
		<div
			class="animate-in slide-in-from-bottom-4 fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-3xl border border-slate-200/80 bg-white/95 px-6 py-4 font-sans shadow-[0_12px_40px_rgba(0,0,0,0.06)] backdrop-blur-md duration-300"
		>
			<span class="text-xl">📋</span>
			<div>
				<p class="text-xs font-bold text-slate-800">LINE用の空き枠をコピーしました</p>
				<p class="mt-0.5 text-[10px] font-medium text-slate-400">
					クリップボードにテキストが保存されました。
				</p>
			</div>
		</div>
	{/if}

	{#if isPublishedToast}
		<div
			class="animate-in slide-in-from-bottom-4 fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-3xl border border-emerald-300/80 bg-emerald-600 px-6 py-4 font-sans text-white shadow-2xl backdrop-blur-md duration-300"
		>
			<span class="text-xl">⚡️</span>
			<div>
				<p class="text-xs font-black">スタッフ全員の画面へ公開しました！</p>
				<p class="mt-0.5 text-[10px] font-medium text-emerald-100">
					Firestoreへ確定更新されました。全端末へ0秒でリアルタイム同期されます。
				</p>
			</div>
		</div>
	{/if}

	{#if isRequestModalOpen}
		<div class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
			<div class="w-full max-w-lg space-y-4 rounded-3xl bg-white p-6 shadow-2xl">
				<div class="flex items-center justify-between border-b border-slate-100 pb-3">
					<h3 class="flex items-center gap-2 text-base font-extrabold text-slate-800">
						<span class="inline-block h-3 w-3 animate-pulse rounded-full bg-rose-500"></span>
						スタッフからの修正依頼一覧 ({pendingShiftRequests.length}件)
					</h3>
					<button
						type="button"
						onclick={() => (isRequestModalOpen = false)}
						class="text-lg font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
					>
						✕
					</button>
				</div>

				{#if pendingShiftRequests.length === 0}
					<p class="py-8 text-center text-sm font-medium text-slate-500">現在、未処理の修正依頼はありません。</p>
				{:else}
					<div class="max-h-[380px] space-y-3 overflow-y-auto pr-1">
						{#each pendingShiftRequests as req}
							<div class="space-y-2.5 rounded-2xl border border-rose-100 bg-rose-50/50 p-4 shadow-xs">
								<div class="flex items-center justify-between text-xs font-bold text-slate-700">
									<span class="rounded-lg bg-rose-100 px-2.5 py-1 text-rose-700">{req.date}</span>
									<span class="text-sm font-black text-slate-900">{req.userName}</span>
								</div>
								<div class="rounded-xl border border-slate-100 bg-white p-3 text-xs text-slate-600">
									<span class="font-bold text-slate-400">申請理由: </span>
									<span class="font-medium text-slate-800">{req.reason || '理由の記述なし'}</span>
								</div>
								<div class="flex justify-end gap-2 pt-1">
									<button
										type="button"
										onclick={() => handleRejectShiftRequest(req)}
										class="cursor-pointer rounded-xl bg-slate-200 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-300 active:scale-95"
									>
										却下
									</button>
									<button
										type="button"
										onclick={() => handleApproveShiftRequest(req)}
										class="cursor-pointer rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-rose-700 active:scale-95"
									>
										承認（シフトを外す）
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes progress-loading {
		0% {
			transform: translateX(-100%);
		}
		50% {
			transform: translateX(200%);
		}
		100% {
			transform: translateX(-100%);
		}
	}
	.animate-progress {
		animation: progress-loading 2s infinite ease-in-out;
	}
</style>

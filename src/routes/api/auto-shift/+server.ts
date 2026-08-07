import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

// ===================================================
// Pure Mathematical Deterministic Solver Utilities
// ===================================================
function getSlotHours(startTime: string, endTime: string): number {
	const [sh, sm] = startTime.split(':').map(Number);
	const [eh, em] = endTime.split(':').map(Number);
	return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

function isWeekend(dateStr: string): boolean {
	const day = new Date(dateStr).getDay();
	return day === 0 || day === 6; // 0: 日曜日, 6: 土曜日
}

function isTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
	const parseToMinutes = (t: string) => {
		const [h, m] = t.split(':').map(Number);
		return h * 60 + m;
	};
	const s1 = parseToMinutes(start1);
	const e1 = parseToMinutes(end1);
	const s2 = parseToMinutes(start2);
	const e2 = parseToMinutes(end2);
	return Math.max(s1, s2) < Math.min(e1, e2);
}

function minutesToTime(m: number): string {
	const h = Math.floor(m / 60);
	const min = m % 60;
	return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function normalizeDateStr(d: any): string {
	if (!d) return '';
	if (typeof d === 'string') {
		const cleaned = d.trim().replace(/\//g, '-').split('T')[0];
		const parts = cleaned.split('-');
		if (parts.length === 3) {
			const year = parts[0];
			const month = String(parts[1]).padStart(2, '0');
			const day = String(parts[2]).padStart(2, '0');
			if (!isNaN(Number(year)) && !isNaN(Number(month)) && !isNaN(Number(day))) {
				return `${year}-${month}-${day}`;
			}
		}
	}
	const dt = new Date(d);
	if (!isNaN(dt.getTime())) {
		const year = dt.getFullYear();
		const month = String(dt.getMonth() + 1).padStart(2, '0');
		const day = String(dt.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
	return String(d);
}

function isStaffOff(staff: any, rawDateStr: string): boolean {
	const normalizedTargetDate = normalizeDateStr(rawDateStr);

	if (Array.isArray(staff.offDates)) {
		const isMatch = staff.offDates.some((d: any) => normalizeDateStr(d) === normalizedTargetDate);
		if (isMatch) return true;
	}

	if (Array.isArray(staff.unavailables)) {
		const isMatch = staff.unavailables.some((d: any) => normalizeDateStr(d) === normalizedTargetDate);
		if (isMatch) return true;
	}

	if (staff.wishes) {
		const wishKey = Object.keys(staff.wishes).find((k) => normalizeDateStr(k) === normalizedTargetDate);
		if (wishKey) {
			const val = staff.wishes[wishKey];
			if (val === 'ng' || (typeof val === 'object' && val?.type === 'ng')) {
				return true;
			}
		}
	}

	return false;
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const startLoopTime = Date.now();
		const body = await request.json();
		const { year, month, staffs, wishesMapByDate, unicesEventsByDate, fsDaysByDate } = body;

		console.log("Loaded Wishes for Auto-Shift:", wishesMapByDate);
		console.log('[ShiftGen] Received Staff Data:', JSON.stringify(staffs, null, 2));

		// Firestore から最新の eventDates 配列を取得
		let eventDates: string[] = [];
		try {
			const settingsDoc = await getDoc(doc(db, 'settings', 'global'));
			if (settingsDoc.exists()) {
				const settingsData = settingsDoc.data();
				eventDates = settingsData.eventDates || [];
			}
		} catch (dbErr) {
			console.warn('[API auto-shift] Failed to load eventDates from settings/global:', dbErr);
		}

		if (!year || !month || !staffs) {
			return json({ error: 'Missing required parameters: year, month, staffs.' }, { status: 400 });
		}

		const lastDay = new Date(year, month, 0).getDate();

		// ===================================================
		// Step 1: スタッフ情報の軽量化 ＆ 物理限界キャップ（有効希望額）計算
		// ===================================================
		const minifiedStaffs = staffs.map((s: any) => {
			const rawOffDates: string[] = Array.isArray(s.offDates)
				? s.offDates
				: Array.isArray(s.unavailables)
				? s.unavailables
				: Array.isArray(s.ngDates)
				? s.ngDates
				: [];

			const normalizedOffDatesSet = new Set<string>(rawOffDates.map(normalizeDateStr));
			const wishes: { [date: string]: string } = {};

			for (let d = 1; d <= lastDay; d++) {
				const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

				let dayWish: any = null;
				if (wishesMapByDate) {
					dayWish = wishesMapByDate[dateStr]?.[s.id];
					if (!dayWish) {
						const altKey = Object.keys(wishesMapByDate).find(
							(k) => normalizeDateStr(k) === dateStr
						);
						if (altKey) {
							dayWish = wishesMapByDate[altKey]?.[s.id];
						}
					}
				}

				if (dayWish) {
					if (dayWish === 'ng' || dayWish.type === 'ng') {
						normalizedOffDatesSet.add(dateStr);
						wishes[dateStr] = 'ng';
					} else if (dayWish.type === 'specific') {
						wishes[dateStr] = `${dayWish.startTime || '09:45'}-${dayWish.endTime || '20:15'}`;
					} else if (dayWish.type === 'free') {
						wishes[dateStr] = 'free';
					}
				}
			}

			const offDates = Array.from(normalizedOffDatesSet);
			const availableDaysCount = Math.max(1, lastDay - offDates.length);
			const hourlyWage = Number(s.hourlyWage || s.hourly_wage) || (s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100);
			const avgDailySlotWage = 5.25 * hourlyWage;
			const targetIncome = s.target_monthly_income || 50000;
			// 物理限界キャップ: 出勤可能日数 * 1日の平均枠給与
			const effectiveTargetIncome = Math.min(targetIncome, availableDaysCount * avgDailySlotWage);

			return {
				id: s.id,
				name: s.name,
				role: s.role,
				hourly_wage: hourlyWage,
				target_monthly_income: targetIncome,
				effectiveTargetIncome,
				max_monthly_income: s.max_monthly_income || 80000,
				availableDaysCount,
				isTrainee: !!(s.is_trainee || s.isTrainee),
				minor: (s.age_group || s.role) === 'minor',
				isUnices: Array.isArray(s.tags) ? s.tags.includes('UNICES') : false,
				preferredDaysPerWeek: Number(s.preferredDaysPerWeek) || 0,
				dayPreferencePolicy: s.dayPreferencePolicy || 'ANY',
				offDates,
				wishes
			};
		});

		// ===================================================
		// Step 2: 空きスロット（席）データの生成
		// ===================================================
		const minifiedSlots: any[] = [];
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const isEventDay = eventDates.includes(dateStr);

			// カフェ前半 (CW AM) × 2枠（イベント日は＋1名で3枠）
			minifiedSlots.push({
				slotId: `${dateStr}_CW_AM_1`,
				date: dateStr,
				startTime: '09:45',
				endTime: '15:00',
				type: 'CW'
			});
			minifiedSlots.push({
				slotId: `${dateStr}_CW_AM_2`,
				date: dateStr,
				startTime: '09:45',
				endTime: '15:00',
				type: 'CW'
			});
			if (isEventDay) {
				minifiedSlots.push({
					slotId: `${dateStr}_CW_AM_3`,
					date: dateStr,
					startTime: '09:45',
					endTime: '15:00',
					type: 'CW'
				});
			}

			// カフェ後半 (CW PM) × 2枠（イベント日は＋1名で3枠）
			minifiedSlots.push({
				slotId: `${dateStr}_CW_PM_1`,
				date: dateStr,
				startTime: '15:00',
				endTime: '20:15',
				type: 'CW'
			});
			minifiedSlots.push({
				slotId: `${dateStr}_CW_PM_2`,
				date: dateStr,
				startTime: '15:00',
				endTime: '20:15',
				type: 'CW'
			});
			if (isEventDay) {
				minifiedSlots.push({
					slotId: `${dateStr}_CW_PM_3`,
					date: dateStr,
					startTime: '15:00',
					endTime: '20:15',
					type: 'CW'
				});
			}

			// フリースクール (FS) 開講日
			const fsDay = fsDaysByDate?.[dateStr];
			if (fsDay?.active) {
				minifiedSlots.push({
					slotId: `${dateStr}_FS_AM_1`,
					date: dateStr,
					startTime: '09:45',
					endTime: '15:00',
					type: 'FS'
				});
				minifiedSlots.push({
					slotId: `${dateStr}_FS_AM_2`,
					date: dateStr,
					startTime: '09:45',
					endTime: '15:00',
					type: 'FS'
				});
				if (isEventDay) {
					minifiedSlots.push({
						slotId: `${dateStr}_FS_AM_3`,
						date: dateStr,
						startTime: '09:45',
						endTime: '15:00',
						type: 'FS'
					});
				}
				minifiedSlots.push({
					slotId: `${dateStr}_FS_PM_1`,
					date: dateStr,
					startTime: '15:00',
					endTime: '20:15',
					type: 'FS'
				});
				minifiedSlots.push({
					slotId: `${dateStr}_FS_PM_2`,
					date: dateStr,
					startTime: '15:00',
					endTime: '20:15',
					type: 'FS'
				});
				if (isEventDay) {
					minifiedSlots.push({
						slotId: `${dateStr}_FS_PM_3`,
						date: dateStr,
						startTime: '15:00',
						endTime: '20:15',
						type: 'FS'
					});
				}
			}

			// UNICES開催日
			const event = unicesEventsByDate?.[dateStr];
			if (event?.active) {
				minifiedSlots.push({
					slotId: `${dateStr}_UNICES_EVENT_1`,
					date: dateStr,
					startTime: event.startTime || '13:00',
					endTime: event.endTime || '15:00',
					type: 'UNICES'
				});
			}
		}

		// ===================================================
		// Step 3: リスク順ソート ＆ 純論理数理アサインループ (0.001秒)
		// ===================================================
		const assignments: any[] = [];
		const earnedWages: { [staffId: string]: number } = {};
		const assignedDaysCountMap: { [staffId: string]: number } = {};
		const weeklyStaffAssignments: { [staffId: string]: { [weekIndex: number]: number } } = {};
		const assignedDaysOfWeekMap: { [staffId: string]: Set<number> } = {};

		minifiedStaffs.forEach((s: any) => {
			earnedWages[s.id] = 0;
			assignedDaysCountMap[s.id] = 0;
			weeklyStaffAssignments[s.id] = {};
			assignedDaysOfWeekMap[s.id] = new Set<number>();
		});

		const getSlotPriority = (slot: any) => {
			// 09:45 開始 または 20:15 終了の開閉店必須枠を最優先 (優先度0)
			const isOpeningOrClosing = slot.startTime === '09:45' || slot.endTime === '20:15';
			if (isOpeningOrClosing) return 0;

			if (slot.type === 'FS') return 1;
			if (slot.type === 'CW') {
				return isWeekend(slot.date) ? 2 : 3;
			}
			if (slot.type === 'UNICES') return 4;
			return 5;
		};

		const allSlots = [...minifiedSlots].sort((a, b) => {
			const pA = getSlotPriority(a);
			const pB = getSlotPriority(b);
			if (pA !== pB) return pA - pB;
			const dateCompare = a.date.localeCompare(b.date);
			if (dateCompare !== 0) return dateCompare;
			return a.slotId.localeCompare(b.slotId);
		});

		for (const slot of allSlots) {
			const normalizedSlotDate = normalizeDateStr(slot.date);
			const slotJsDate = new Date(slot.date);
			const slotDay = slotJsDate.getDate();
			const weekIndex = Math.floor((slotDay - 1) / 7);
			const dayOfWeek = slotJsDate.getDay();

			const candidateAssignments: { 
				[staffId: string]: { startTime: string, endTime: string, hours: number } 
			} = {};

			// ハード制約（絶対除外条件）の適用
			const eligibleStaffs = minifiedStaffs.filter((s: any) => {
				// 1. 休み希望日（NG日）の絶対除外
				if (isStaffOff(s, normalizedSlotDate)) {
					console.log(`[OffDate Guard] Skipped ${s.name} for ${slot.date} (${slot.slotId}) due to off-date wish`);
					return false;
				}

				// 2. 勤務可能時間帯の交差計算
				let availStartMin = 0;
				let availEndMin = 24 * 60;

				const specificWishKey = Object.keys(s.wishes || {}).find(
					(k) => normalizeDateStr(k) === normalizedSlotDate
				);
				const specificWish = specificWishKey ? s.wishes[specificWishKey] : null;
				if (specificWish) {
					if (specificWish === 'ng') {
						console.log(`[OffDate Guard] Skipped ${s.name} for ${slot.date} (${slot.slotId}) due to specific NG wish`);
						return false;
					} else if (specificWish !== 'free') {
						const [wStart, wEnd] = specificWish.split('-');
						const [hS, mS] = wStart.split(':').map(Number);
						const [hE, mE] = wEnd.split(':').map(Number);
						availStartMin = hS * 60 + mS;
						availEndMin = hE * 60 + mE;
					}
				}

				const [sH, sM] = slot.startTime.split(':').map(Number);
				const [eH, eM] = slot.endTime.split(':').map(Number);
				const slotStartMin = sH * 60 + sM;
				const slotEndMin = eH * 60 + eM;

				const intersectStart = Math.max(slotStartMin, availStartMin);
				const intersectEnd = Math.min(slotEndMin, availEndMin);
				const intersectHours = (intersectEnd - intersectStart) / 60;

				// 3. 3.0時間未満スロットの除外ハード制約（UNICES等単独コマでの3.0h未満不可）
				if (intersectHours < 3.0 && slot.type !== 'UNICES') return false;

				const personalStartTime = minutesToTime(intersectStart);
				const personalEndTime = minutesToTime(intersectEnd);

				// 4. 8万円上限ガード
				const addedWage = intersectHours * s.hourly_wage;
				if (earnedWages[s.id] + addedWage > s.max_monthly_income) return false;

				// 5. 未成年・研修生ワンオペ/ペア禁止ルール
				const isMinorOrTrainee = s.minor || s.isTrainee;
				if (isMinorOrTrainee && (slot.type === 'CW' || slot.type === 'FS')) {
					const groupPrefix = slot.slotId.substring(0, slot.slotId.lastIndexOf('_'));
					const hasOtherMinorOrTraineeInGroup = assignments.some((a) => {
						if (!a.assignedStaffId || !a.slotId.startsWith(groupPrefix)) return false;
						const partnerStaff = minifiedStaffs.find((ps: any) => ps.id === a.assignedStaffId);
						return partnerStaff && (partnerStaff.minor || partnerStaff.isTrainee);
					});
					if (hasOtherMinorOrTraineeInGroup) return false;
				}

				// 6. ダブルブッキング防止
				const hasTimeConflict = assignments.some((a) => {
					if (a.assignedStaffId !== s.id || normalizeDateStr(a.date) !== normalizedSlotDate) return false;
					return isTimeOverlap(a.startTime, a.endTime, personalStartTime, personalEndTime);
				});
				if (hasTimeConflict) return false;

				candidateAssignments[s.id] = {
					startTime: personalStartTime,
					endTime: personalEndTime,
					hours: intersectHours
				};

				return true;
			});

			let primaryCandidates: any[] = [];
			let fallbackCandidates: any[] = [];

			if (slot.type === 'UNICES') {
				primaryCandidates = eligibleStaffs.filter((s: any) => (s.role === 'UNICES' || s.isUnices) && !isStaffOff(s, normalizedSlotDate));
				fallbackCandidates = eligibleStaffs.filter((s: any) => s.role === 'employee' && s.role !== 'UNICES' && !s.isUnices && !isStaffOff(s, normalizedSlotDate));
			} else {
				primaryCandidates = eligibleStaffs.filter((s: any) => s.role !== 'employee' && !isStaffOff(s, normalizedSlotDate));
				fallbackCandidates = eligibleStaffs.filter((s: any) => s.role === 'employee' && !isStaffOff(s, normalizedSlotDate));
			}

			const targetCandidates = primaryCandidates.length > 0 ? primaryCandidates : fallbackCandidates;

			if (targetCandidates.length === 0) {
				assignments.push({
					date: slot.date,
					slotId: slot.slotId,
					startTime: slot.startTime,
					endTime: slot.endTime,
					assignedStaffId: ''
				});
				continue;
			}

			// ===================================================
			// 1500点満点 優先度スコア (priorityScore) 算定式
			// ===================================================
			let bestStaffId = '';
			let maxPriorityScore = -Infinity;

			targetCandidates.forEach((s: any) => {
				// 1. dayPreferenceScore (最大 700点) — 最優先
				let dayPreferenceScore = 0;
				if (s.dayPreferencePolicy === 'FIXED') {
					if (assignedDaysOfWeekMap[s.id].has(dayOfWeek)) {
						dayPreferenceScore = 700;
					} else if (assignedDaysOfWeekMap[s.id].size === 0) {
						dayPreferenceScore = 350;
					}
				} else if (s.dayPreferencePolicy === 'ROTATING') {
					if (assignedDaysOfWeekMap[s.id].size > 0 && !assignedDaysOfWeekMap[s.id].has(dayOfWeek)) {
						dayPreferenceScore = 700;
					} else if (assignedDaysOfWeekMap[s.id].size === 0) {
						dayPreferenceScore = 350;
					}
				} else {
					dayPreferenceScore = 200; // ANY
				}

				// 2. shiftDigestScore (最大 500点): (1 - (現在アサイン日数 / 出勤可能日数)) * 500
				const currentDays = assignedDaysCountMap[s.id] || 0;
				const availableDays = s.availableDaysCount || 1;
				const digestRatio = Math.min(1.0, currentDays / availableDays);
				const shiftDigestScore = Math.round((1.0 - digestRatio) * 500);

				// 3. incomeAndDaysScore (最大 300点)
				const currentWeekDays = weeklyStaffAssignments[s.id]?.[weekIndex] || 0;
				const weeklyDaysBonus = (s.preferredDaysPerWeek > 0 && currentWeekDays < s.preferredDaysPerWeek) ? 150 : 0;
				
				const currentEarned = earnedWages[s.id] || 0;
				const effectiveIncome = s.effectiveTargetIncome || 50000;
				const incomeRatio = Math.min(1.0, currentEarned / effectiveIncome);
				const incomeProgressScore = Math.round((1.0 - incomeRatio) * 150);

				const incomeAndDaysScore = weeklyDaysBonus + incomeProgressScore;

				// 合計 priorityScore (1500点満点)
				const priorityScore = dayPreferenceScore + shiftDigestScore + incomeAndDaysScore;

				if (priorityScore > maxPriorityScore) {
					maxPriorityScore = priorityScore;
					bestStaffId = s.id;
				} else if (priorityScore === maxPriorityScore) {
					if (earnedWages[s.id] < earnedWages[bestStaffId]) {
						bestStaffId = s.id;
					}
				}
			});

			if (bestStaffId) {
				const personalAssign = candidateAssignments[bestStaffId];
				assignments.push({
					date: slot.date,
					slotId: slot.slotId,
					startTime: personalAssign.startTime,
					endTime: personalAssign.endTime,
					assignedStaffId: bestStaffId
				});

				const staff = minifiedStaffs.find((st: any) => st.id === bestStaffId);
				if (staff) {
					earnedWages[bestStaffId] += personalAssign.hours * staff.hourly_wage;
					assignedDaysCountMap[bestStaffId] = (assignedDaysCountMap[bestStaffId] || 0) + 1;
					assignedDaysOfWeekMap[bestStaffId].add(dayOfWeek);
					weeklyStaffAssignments[bestStaffId][weekIndex] = (weeklyStaffAssignments[bestStaffId][weekIndex] || 0) + 1;
				}
			} else {
				assignments.push({
					date: slot.date,
					slotId: slot.slotId,
					startTime: slot.startTime,
					endTime: slot.endTime,
					assignedStaffId: ''
				});
			}
		}

		// ===================================================
		// Step 4: 店舗防衛ロジック（無人時間の完全撲滅・開閉店09:45〜20:15カバー保証・ワンオペ抑制）
		// ===================================================
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
			const normalizedTargetDate = normalizeDateStr(dateStr);

			// 当日の確定アサインリスト
			const dayAssignments = assignments.filter(
				(a) => normalizeDateStr(a.date) === normalizedTargetDate && a.assignedStaffId
			);

			const OPEN_MIN = 585; // 09:45
			const CLOSE_MIN = 1215; // 20:15
			const intervalCount: { [minute: number]: number } = {};

			for (let m = OPEN_MIN; m < CLOSE_MIN; m += 15) {
				intervalCount[m] = 0;
			}

			dayAssignments.forEach((a) => {
				const [sH, sM] = a.startTime.split(':').map(Number);
				const [eH, eM] = a.endTime.split(':').map(Number);
				const startM = sH * 60 + sM;
				const endM = eH * 60 + eM;

				for (let m = OPEN_MIN; m < CLOSE_MIN; m += 15) {
					if (m >= startM && m < endM) {
						intervalCount[m] += 1;
					}
				}
			});

			// A1. 開店カバー判定 (09:45の開始が0名の場合)
			if (intervalCount[OPEN_MIN] === 0 && dayAssignments.length > 0) {
				const validCandidates = dayAssignments.filter((a) => {
					const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
					if (!staff || isStaffOff(staff, normalizedTargetDate)) return false;
					const [sH, sM] = a.startTime.split(':').map(Number);
					const oldStartM = sH * 60 + sM;
					const extraHours = (oldStartM - OPEN_MIN) / 60;
					const extraWage = extraHours * staff.hourly_wage;
					return earnedWages[staff.id] + extraWage <= staff.max_monthly_income;
				});

				if (validCandidates.length > 0) {
					const earliestAssign = validCandidates.reduce((prev, curr) => {
						const [pH, pM] = prev.startTime.split(':').map(Number);
						const [cH, cM] = curr.startTime.split(':').map(Number);
						return cH * 60 + cM < pH * 60 + pM ? curr : prev;
					});

					const staff = minifiedStaffs.find((s: any) => s.id === earliestAssign.assignedStaffId);
					if (staff) {
						const [sH, sM] = earliestAssign.startTime.split(':').map(Number);
						const oldStartM = sH * 60 + sM;
						const extraHours = (oldStartM - OPEN_MIN) / 60;
						const extraWage = extraHours * staff.hourly_wage;

						earliestAssign.startTime = '09:45';
						earnedWages[staff.id] += extraWage;
						console.log(`[Store Defense] Opening auto-extended to 09:45 for ${staff.name} on ${dateStr} (+${extraWage}yen, total: ${earnedWages[staff.id]}yen)`);
					}
				}
			}

			// A2. 閉店カバー判定 (20:15の終了が0名の場合)
			if (intervalCount[CLOSE_MIN - 15] === 0 && dayAssignments.length > 0) {
				const validCandidates = dayAssignments.filter((a) => {
					const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
					if (!staff || isStaffOff(staff, normalizedTargetDate)) return false;
					const [eH, eM] = a.endTime.split(':').map(Number);
					const oldEndM = eH * 60 + eM;
					const extraHours = (CLOSE_MIN - oldEndM) / 60;
					const extraWage = extraHours * staff.hourly_wage;
					return earnedWages[staff.id] + extraWage <= staff.max_monthly_income;
				});

				if (validCandidates.length > 0) {
					const latestAssign = validCandidates.reduce((prev, curr) => {
						const [pH, pM] = prev.endTime.split(':').map(Number);
						const [cH, cM] = curr.endTime.split(':').map(Number);
						return cH * 60 + cM > pH * 60 + pM ? curr : prev;
					});

					const staff = minifiedStaffs.find((s: any) => s.id === latestAssign.assignedStaffId);
					if (staff) {
						const [eH, eM] = latestAssign.endTime.split(':').map(Number);
						const oldEndM = eH * 60 + eM;
						const extraHours = (CLOSE_MIN - oldEndM) / 60;
						const extraWage = extraHours * staff.hourly_wage;

						latestAssign.endTime = '20:15';
						earnedWages[staff.id] += extraWage;
						console.log(`[Store Defense] Closing auto-extended to 20:15 for ${staff.name} on ${dateStr} (+${extraWage}yen, total: ${earnedWages[staff.id]}yen)`);
					}
				}
			}

			// B. 無人時間帯（0名時間）の自動埋め拡張 (上限超えガード付き)
			for (let m = OPEN_MIN; m < CLOSE_MIN; m += 15) {
				if (intervalCount[m] === 0 && dayAssignments.length > 0) {
					const adjAssign = dayAssignments.find((a) => {
						const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
						if (!staff || isStaffOff(staff, normalizedTargetDate)) return false;
						const [sH, sM] = a.startTime.split(':').map(Number);
						const [eH, eM] = a.endTime.split(':').map(Number);
						const sMins = sH * 60 + sM;
						const eMins = eH * 60 + eM;
						const isAdjacent = Math.abs(sMins - (m + 15)) <= 30 || Math.abs(eMins - m) <= 30;
						if (!isAdjacent) return false;

						const extraWage = 0.25 * staff.hourly_wage;
						return earnedWages[staff.id] + extraWage <= staff.max_monthly_income;
					});

					if (adjAssign) {
						const staff = minifiedStaffs.find((s: any) => s.id === adjAssign.assignedStaffId)!;
						const [sH, sM] = adjAssign.startTime.split(':').map(Number);
						const [eH, eM] = adjAssign.endTime.split(':').map(Number);
						const sMins = sH * 60 + sM;
						const eMins = eH * 60 + eM;

						if (m < sMins) {
							adjAssign.startTime = minutesToTime(m);
						}
						if (m + 15 > eMins) {
							adjAssign.endTime = minutesToTime(m + 15);
						}
						earnedWages[staff.id] += 0.25 * staff.hourly_wage;
						console.log(`[Store Defense] Gap auto-filled on ${dateStr} at ${minutesToTime(m)} for ${staff.name}`);
					}
				}
			}

			// C. 店舗不備警告判定 (最終チェック)
			let finalHasZero = false;
			for (let m = OPEN_MIN; m < CLOSE_MIN; m += 15) {
				let count = 0;
				dayAssignments.forEach((a) => {
					const [sH, sM] = a.startTime.split(':').map(Number);
					const [eH, eM] = a.endTime.split(':').map(Number);
					const sMins = sH * 60 + sM;
					const eMins = eH * 60 + eM;
					if (m >= sMins && m < eMins) count++;
				});
				if (count === 0) {
					finalHasZero = true;
					break;
				}
			}

			if (finalHasZero || dayAssignments.length === 0) {
				console.warn(`[Store Deficit Alert] Date ${dateStr} has unresolvable store deficit (opening/closing or gap).`);
				assignments.push({
					date: dateStr,
					slotId: `${dateStr}_STORE_DEFICIT_ALERT`,
					startTime: '09:45',
					endTime: '20:15',
					assignedStaffId: '',
					storeDeficit: true,
					deficitReason: '⚠️ 店舗不備（開閉店枠不足または無人時間あり）'
				});
			}
		}

		const totalDuration = Date.now() - startLoopTime;
		console.log(`[Pure Math Solver] Completed in ${totalDuration}ms. Total slots: ${allSlots.length}`);
		console.log('[Pure Math Solver] Final earned wages summary:');
		minifiedStaffs.forEach((s: any) => {
			console.log(` - ${s.name} (Effective Target: ${s.effectiveTargetIncome}yen, Max: ${s.max_monthly_income}): ${earnedWages[s.id]}yen`);
		});

		return json({ assignments });
	} catch (e: any) {
		console.error('Failed to generate shifts via Pure Math Solver:', e);
		return json({ error: e.message || 'Internal server error.' }, { status: 500 });
	}
};

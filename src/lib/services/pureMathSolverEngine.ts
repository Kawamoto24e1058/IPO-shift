// ===================================================
// Pure Mathematical Deterministic Solver Engine
// 0.001s Local Generation & Browser Console Log Output
// Strict Enforcement of Level 1 Guards vs Level 2 Store Cover
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

export function normalizeDateStr(d: any): string {
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

export function isStaffOff(staff: any, rawDateStr: string): boolean {
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

/**
 * 労基法・労働環境ガード: 直前6連勤済みかチェック (7連勤以上物理禁止)
 */
function getConsecutiveWorkDaysBefore(
	staffId: string,
	currentDateStr: string,
	assignedDaysMap: { [staffId: string]: Set<string> }
): number {
	let count = 0;
	const [y, m, d] = currentDateStr.split('-').map(Number);
	const dt = new Date(y, m - 1, d);
	while (true) {
		dt.setDate(dt.getDate() - 1);
		const year = dt.getFullYear();
		const month = String(dt.getMonth() + 1).padStart(2, '0');
		const day = String(dt.getDate()).padStart(2, '0');
		const dateStr = `${year}-${month}-${day}`;

		if (assignedDaysMap[staffId]?.has(dateStr)) {
			count++;
		} else {
			break;
		}
	}
	return count;
}

/**
 * 労基法・労働環境ガード: 前日20:15遅番勤務者かチェック (翌日09:45早番物理禁止)
 */
function workedLatePreviousDay(
	staffId: string,
	currentDateStr: string,
	assignments: Assignment[]
): boolean {
	const [y, m, d] = currentDateStr.split('-').map(Number);
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() - 1);
	const year = dt.getFullYear();
	const month = String(dt.getMonth() + 1).padStart(2, '0');
	const day = String(dt.getDate()).padStart(2, '0');
	const prevDateStr = `${year}-${month}-${day}`;

	return assignments.some((a) => {
		return (
			a.assignedStaffId === staffId &&
			normalizeDateStr(a.date) === prevDateStr &&
			a.endTime === '20:15'
		);
	});
}

export interface EngineInput {
	year: number;
	month: number;
	staffs: any[];
	wishesMapByDate: any;
	unicesEventsByDate?: any;
	fsDaysByDate?: any;
	eventDates?: string[];
}

export interface Assignment {
	date: string;
	slotId: string;
	startTime: string;
	endTime: string;
	assignedStaffId: string;
	storeDeficit?: boolean;
	deficitReason?: string;
}

/**
 * レベル1：絶対最優先ガード判定（いかなる穴埋め・店舗カバーでも破ってはならない鉄則）
 */
function checkLevel1Guard(params: {
	staff: any;
	dateStr: string;
	slotStart: string;
	slotEnd: string;
	addedWage: number;
	earnedWages: { [staffId: string]: number };
	assignedDays: { [staffId: string]: Set<string> };
	assignments: Assignment[];
}): { pass: boolean; reason?: string } {
	const { staff, dateStr, slotStart, addedWage, earnedWages, assignedDays, assignments } = params;
	const normalizedTargetDate = normalizeDateStr(dateStr);

	// 1-1. 休み希望日（NG日）の絶対除外 (物理的アサイン100%禁止)
	if (isStaffOff(staff, normalizedTargetDate)) {
		return { pass: false, reason: 'NG Day' };
	}

	// 1-2. 給与上限（maxMonthlyIncome）絶対ストップガード (100%超過禁止)
	if (earnedWages[staff.id] + addedWage > staff.max_monthly_income) {
		return { pass: false, reason: 'Max Income Reached' };
	}

	// 1-3. 7連勤以上物理禁止ガード (連続出勤6日まで)
	const consDays = getConsecutiveWorkDaysBefore(staff.id, normalizedTargetDate, assignedDays);
	if (consDays >= 6) {
		return { pass: false, reason: 'Consecutive Work Limit (7 Days)' };
	}

	// 1-4. 前日20:15遅番 ➔ 翌日09:45早番物理禁止ガード
	if (slotStart === '09:45') {
		const wasLateYesterday = workedLatePreviousDay(staff.id, normalizedTargetDate, assignments);
		if (wasLateYesterday) {
			return { pass: false, reason: 'Late Shift Yesterday -> Early Shift Today Prohibited' };
		}
	}

	return { pass: true };
}

export function runPureMathAutoShiftEngine(params: EngineInput): { assignments: Assignment[] } {
	const startLoopTime = Date.now();
	const { year, month, staffs, wishesMapByDate, unicesEventsByDate, fsDaysByDate } = params;
	const eventDates = params.eventDates || [];

	console.log("⚡️ [UI] 自動生成ボタンが押されました");
	console.log("=== [ShiftGen Engine STAGE 1] Starting generation ===");
	console.log("Loaded Wishes Map:", wishesMapByDate);
	console.log('[ShiftGen] Received Staff Data:', JSON.stringify(staffs, null, 2));

	if (!year || !month || !staffs) {
		throw new Error('Missing required parameters: year, month, staffs.');
	}

	const lastDay = new Date(year, month, 0).getDate();

	// ===================================================
	// Step 1: スタッフ情報の軽量化 ＆ 物理限界キャップ計算
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
				slotId: `${dateStr}_CW_AM_3_EVENT`,
				date: dateStr,
				startTime: '09:45',
				endTime: '15:00',
				type: 'CW'
			});
		}

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
				slotId: `${dateStr}_CW_PM_3_EVENT`,
				date: dateStr,
				startTime: '15:00',
				endTime: '20:15',
				type: 'CW'
			});
		}

		const isFsDay = fsDaysByDate ? fsDaysByDate[dateStr] : false;
		if (isFsDay) {
			minifiedSlots.push({
				slotId: `${dateStr}_FS_AM_1`,
				date: dateStr,
				startTime: '09:45',
				endTime: '15:00',
				type: 'FS'
			});
			minifiedSlots.push({
				slotId: `${dateStr}_FS_PM_1`,
				date: dateStr,
				startTime: '15:00',
				endTime: '20:15',
				type: 'FS'
			});
		}

		const unicesEvent = unicesEventsByDate ? unicesEventsByDate[dateStr] : null;
		if (unicesEvent) {
			minifiedSlots.push({
				slotId: `${dateStr}_UNICES_1`,
				date: dateStr,
				startTime: unicesEvent.startTime || '18:00',
				endTime: unicesEvent.endTime || '20:15',
				type: 'UNICES'
			});
		}
	}

	// ===================================================
	// Step 3: アサイン実行ループ（決定論的選定 ＋ レベル1ガード）
	// ===================================================
	const assignments: Assignment[] = [];
	const earnedWages: { [staffId: string]: number } = {};
	const assignedDays: { [staffId: string]: Set<string> } = {};

	minifiedStaffs.forEach((s: any) => {
		earnedWages[s.id] = 0;
		assignedDays[s.id] = new Set<string>();
	});

	const getSlotPriority = (slot: any) => {
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

		const eligibleStaffs = minifiedStaffs.filter((s: any) => {
			let availStartMin = 0;
			let availEndMin = 24 * 60;

			const specificWishKey = Object.keys(s.wishes || {}).find(
				(k) => normalizeDateStr(k) === normalizedSlotDate
			);
			const specificWish = specificWishKey ? s.wishes[specificWishKey] : null;
			if (specificWish) {
				if (specificWish === 'ng') {
					console.log(`[ShiftGen Filter] Excluded user ${s.name} (${s.id}) on ${slot.date} (Reason: NG Day)`);
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

			if (intersectHours < 3.0 && slot.type !== 'UNICES') return false;

			const personalStartTime = minutesToTime(intersectStart);
			const personalEndTime = minutesToTime(intersectEnd);
			const addedWage = intersectHours * s.hourly_wage;

			// 【レベル1絶対最優先ガードの厳格適用】
			const lvl1 = checkLevel1Guard({
				staff: s,
				dateStr: slot.date,
				slotStart: personalStartTime,
				slotEnd: personalEndTime,
				addedWage,
				earnedWages,
				assignedDays,
				assignments
			});

			if (!lvl1.pass) {
				console.log(`[ShiftGen Filter] Excluded user ${s.name} (${s.id}) on ${slot.date} (Reason: ${lvl1.reason})`);
				return false;
			}

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
			const isAlreadyAssignedInOverlappingSlot = assignments.some((a) => {
				if (a.assignedStaffId !== s.id || a.date !== slot.date) return false;
				return isTimeOverlap(slot.startTime, slot.endTime, a.startTime, a.endTime);
			});
			if (isAlreadyAssignedInOverlappingSlot) return false;

			// 7. UNICES 開催日の担当資格チェック
			if (slot.type === 'UNICES' && !s.isUnices) return false;

			return true;
		});

		if (eligibleStaffs.length > 0) {
			eligibleStaffs.sort((a: any, b: any) => {
				const ratioA = earnedWages[a.id] / (a.effectiveTargetIncome || 1);
				const ratioB = earnedWages[b.id] / (b.effectiveTargetIncome || 1);
				if (Math.abs(ratioA - ratioB) > 0.05) {
					return ratioA - ratioB;
				}
				return earnedWages[a.id] - earnedWages[b.id];
			});

			const selectedStaff = eligibleStaffs[0];

			let finalStart = slot.startTime;
			let finalEnd = slot.endTime;

			const specificWishKey = Object.keys(selectedStaff.wishes || {}).find(
				(k) => normalizeDateStr(k) === normalizedSlotDate
			);
			const specificWish = specificWishKey ? selectedStaff.wishes[specificWishKey] : null;
			if (specificWish && specificWish !== 'free' && specificWish !== 'ng') {
				const [wStart, wEnd] = specificWish.split('-');
				const [hS, mS] = wStart.split(':').map(Number);
				const [hE, mE] = wEnd.split(':').map(Number);
				const availStartMin = hS * 60 + mS;
				const availEndMin = hE * 60 + mE;

				const [sH, sM] = slot.startTime.split(':').map(Number);
				const [eH, eM] = slot.endTime.split(':').map(Number);
				const slotStartMin = sH * 60 + sM;
				const slotEndMin = eH * 60 + eM;

				const intersectStart = Math.max(slotStartMin, availStartMin);
				const intersectEnd = Math.min(slotEndMin, availEndMin);

				finalStart = minutesToTime(intersectStart);
				finalEnd = minutesToTime(intersectEnd);
			}

			const assignedHours = getSlotHours(finalStart, finalEnd);
			const addedWage = assignedHours * selectedStaff.hourly_wage;

			assignments.push({
				date: slot.date,
				slotId: slot.slotId,
				startTime: finalStart,
				endTime: finalEnd,
				assignedStaffId: selectedStaff.id
			});

			earnedWages[selectedStaff.id] += addedWage;
			assignedDays[selectedStaff.id].add(slot.date);
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
	// Step 4 / STAGE 2: 店舗防衛ロジック（レベル1ガード通過者のみ拡張）
	// ===================================================
	console.log("=== [ShiftGen Engine STAGE 2] Running 20:15 Store Cover Check ===");
	for (let d = 1; d <= lastDay; d++) {
		const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const normalizedTargetDate = normalizeDateStr(dateStr);

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
		if (intervalCount[OPEN_MIN] === 0) {
			const validCandidates = dayAssignments.filter((a) => {
				const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
				if (!staff) return false;
				const [sH, sM] = a.startTime.split(':').map(Number);
				const oldStartM = sH * 60 + sM;
				const extraHours = (oldStartM - OPEN_MIN) / 60;
				const extraWage = extraHours * staff.hourly_wage;

				return checkLevel1Guard({
					staff,
					dateStr,
					slotStart: '09:45',
					slotEnd: a.endTime,
					addedWage: extraWage,
					earnedWages,
					assignedDays,
					assignments
				}).pass;
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
					console.log(`[Store Defense] Opening auto-extended to 09:45 for ${staff.name} on ${dateStr} (+${extraWage}yen)`);
				}
			} else {
				const availableNewStaffs = minifiedStaffs.filter((staff: any) => {
					const isAlreadyWorking = dayAssignments.some((a) => a.assignedStaffId === staff.id);
					if (isAlreadyWorking) return false;
					const shiftHours = 5.25;
					const addedWage = shiftHours * staff.hourly_wage;

					return checkLevel1Guard({
						staff,
						dateStr,
						slotStart: '09:45',
						slotEnd: '15:00',
						addedWage,
						earnedWages,
						assignedDays,
						assignments
					}).pass;
				});

				if (availableNewStaffs.length > 0) {
					availableNewStaffs.sort((a: any, b: any) => earnedWages[a.id] - earnedWages[b.id]);
					const bestStaff = availableNewStaffs[0];
					const newAssign = {
						date: dateStr,
						slotId: `${dateStr}_CW_AM_OPENING_COVER`,
						startTime: '09:45',
						endTime: '15:00',
						assignedStaffId: bestStaff.id
					};
					assignments.push(newAssign);
					dayAssignments.push(newAssign);
					earnedWages[bestStaff.id] += 5.25 * bestStaff.hourly_wage;
					assignedDays[bestStaff.id].add(dateStr);
					console.log(`[Store Defense] New opening cover assigned to ${bestStaff.name} on ${dateStr} (09:45-15:00)`);
				}
			}
		}

		// A2. 閉店カバー判定 (20:15の終了が0名の場合)
		if (intervalCount[CLOSE_MIN - 15] === 0) {
			const validCandidates = dayAssignments.filter((a) => {
				const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
				if (!staff) return false;
				const [eH, eM] = a.endTime.split(':').map(Number);
				const oldEndM = eH * 60 + eM;
				const extraHours = (CLOSE_MIN - oldEndM) / 60;
				const extraWage = extraHours * staff.hourly_wage;

				return checkLevel1Guard({
					staff,
					dateStr,
					slotStart: a.startTime,
					slotEnd: '20:15',
					addedWage: extraWage,
					earnedWages,
					assignedDays,
					assignments
				}).pass;
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
					console.log(`[Store Defense] Closing auto-extended to 20:15 for ${staff.name} on ${dateStr} (+${extraWage}yen)`);
				}
			} else {
				const availableNewStaffs = minifiedStaffs.filter((staff: any) => {
					const isAlreadyWorking = dayAssignments.some((a) => a.assignedStaffId === staff.id);
					if (isAlreadyWorking) return false;
					const shiftHours = 5.25;
					const addedWage = shiftHours * staff.hourly_wage;

					return checkLevel1Guard({
						staff,
						dateStr,
						slotStart: '15:00',
						slotEnd: '20:15',
						addedWage,
						earnedWages,
						assignedDays,
						assignments
					}).pass;
				});

				if (availableNewStaffs.length > 0) {
					availableNewStaffs.sort((a: any, b: any) => earnedWages[a.id] - earnedWages[b.id]);
					const bestStaff = availableNewStaffs[0];
					const newAssign = {
						date: dateStr,
						slotId: `${dateStr}_FS_PM_CLOSING_COVER`,
						startTime: '15:00',
						endTime: '20:15',
						assignedStaffId: bestStaff.id
					};
					assignments.push(newAssign);
					dayAssignments.push(newAssign);
					earnedWages[bestStaff.id] += 5.25 * bestStaff.hourly_wage;
					assignedDays[bestStaff.id].add(dateStr);
					console.log(`[Store Defense] New closing cover assigned to ${bestStaff.name} on ${dateStr} (15:00-20:15)`);
				}
			}
		}

		// B. 無人時間帯（0名時間）の自動埋め拡張 (レベル1ガード通過者のみ)
		for (let m = OPEN_MIN; m < CLOSE_MIN; m += 15) {
			if (intervalCount[m] === 0 && dayAssignments.length > 0) {
				const adjAssign = dayAssignments.find((a) => {
					const staff = minifiedStaffs.find((s: any) => s.id === a.assignedStaffId);
					if (!staff) return false;
					const [sH, sM] = a.startTime.split(':').map(Number);
					const [eH, eM] = a.endTime.split(':').map(Number);
					const sMins = sH * 60 + sM;
					const eMins = eH * 60 + eM;
					const isAdjacent = Math.abs(sMins - (m + 15)) <= 30 || Math.abs(eMins - m) <= 30;
					if (!isAdjacent) return false;

					const extraWage = 0.25 * staff.hourly_wage;
					return checkLevel1Guard({
						staff,
						dateStr,
						slotStart: m < sMins ? minutesToTime(m) : a.startTime,
						slotEnd: m + 15 > eMins ? minutesToTime(m + 15) : a.endTime,
						addedWage: extraWage,
						earnedWages,
						assignedDays,
						assignments
					}).pass;
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

		// C. 店舗不備警告判定
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
			console.warn(`[Store Deficit Alert] Date ${dateStr} has unresolvable store deficit.`);
			assignments.push({
				date: dateStr,
				slotId: `${dateStr}_STORE_DEFICIT_ALERT`,
				startTime: '09:45',
				endTime: '20:15',
				assignedStaffId: '',
				storeDeficit: true,
				deficitReason: '⚠️ 店舗不備（要管理者補填）'
			});
		}
	}

	// ===================================================
	// Final Pass: 20:15 閉店枠最終アサイン補正 (レベル1絶対死守)
	// レベル1をクリアできるスタッフが1人も存在しない場合、強引な上書きは100%禁止し未アサインとして出力
	// ===================================================
	console.log("=== [ShiftGen Engine Final Pass] Running 20:15 Closing Cover Final Audit (Level 1 Compliant) ===");
	for (let d = 1; d <= lastDay; d++) {
		const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
		const normalizedTargetDate = normalizeDateStr(dateStr);

		const activeAssignments = assignments.filter(
			(a) => normalizeDateStr(a.date) === normalizedTargetDate && a.assignedStaffId
		);

		const closingCount = activeAssignments.filter((a) => a.endTime === '20:15').length;

		if (closingCount === 0) {
			console.log(`[Final Pass 20:15 Audit] Date ${dateStr} has 0 closing staff (20:15). Running Level 1 Compliant 補正...`);

			let extended = false;
			if (activeAssignments.length > 0) {
				const sortedCandidates = [...activeAssignments].sort((a, b) => {
					const [aH, aM] = a.endTime.split(':').map(Number);
					const [bH, bM] = b.endTime.split(':').map(Number);
					return (bH * 60 + bM) - (aH * 60 + aM);
				});

				for (const cand of sortedCandidates) {
					const staff = minifiedStaffs.find((s: any) => s.id === cand.assignedStaffId);
					if (!staff) continue;

					const [eH, eM] = cand.endTime.split(':').map(Number);
					const oldEndM = eH * 60 + eM;
					if (oldEndM >= 1215) {
						extended = true;
						break;
					}

					const extraHours = (1215 - oldEndM) / 60;
					const extraWage = extraHours * staff.hourly_wage;

					// レベル1絶対最優先ガードチェック
					const lvl1 = checkLevel1Guard({
						staff,
						dateStr,
						slotStart: cand.startTime,
						slotEnd: '20:15',
						addedWage: extraWage,
						earnedWages,
						assignedDays,
						assignments
					});

					if (lvl1.pass) {
						cand.endTime = '20:15';
						earnedWages[staff.id] += extraWage;
						extended = true;
						console.log(`[Final Pass Auto Extension] Extended ${staff.name}'s shift to 20:15 on ${dateStr} (+${extraWage}yen)`);
						break;
					} else {
						console.log(`[Final Pass Extension Blocked] Cannot extend ${staff.name} on ${dateStr} to 20:15 (Reason: ${lvl1.reason})`);
					}
				}
			}

			// 延長が不可能な場合、未出勤の出勤可能スタッフから新規アサイン (レベル1クリア者限定)
			if (!extended) {
				const availableNewStaffs = minifiedStaffs.filter((staff: any) => {
					const isAlreadyWorking = activeAssignments.some((a) => a.assignedStaffId === staff.id);
					if (isAlreadyWorking) return false;
					const shiftHours = 5.25;
					const addedWage = shiftHours * staff.hourly_wage;

					return checkLevel1Guard({
						staff,
						dateStr,
						slotStart: '15:00',
						slotEnd: '20:15',
						addedWage,
						earnedWages,
						assignedDays,
						assignments
					}).pass;
				});

				if (availableNewStaffs.length > 0) {
					availableNewStaffs.sort((a: any, b: any) => earnedWages[a.id] - earnedWages[b.id]);
					const bestStaff = availableNewStaffs[0];
					const newAssign: Assignment = {
						date: dateStr,
						slotId: `${dateStr}_FINAL_PASS_PM_CLOSING_COVER`,
						startTime: '15:00',
						endTime: '20:15',
						assignedStaffId: bestStaff.id
					};
					assignments.push(newAssign);
					earnedWages[bestStaff.id] += 5.25 * bestStaff.hourly_wage;
					assignedDays[bestStaff.id].add(dateStr);
					extended = true;
					console.log(`[Final Pass New Assign] Assigned ${bestStaff.name} on ${dateStr} (15:00-20:15) for closing cover`);
				}
			}

			// レベル1をクリアできるスタッフが1人も存在しない場合：
			// 休み希望者や上限超えのスタッフを強引に配置せず、⚠️ 未アサイン（要管理者補填）とする！
			if (!extended) {
				console.warn(`[Final Pass Level 1 Protection] No staff available for closing cover on ${dateStr} without breaking Level 1 rules. Marking as Unassigned (Store Deficit).`);
				assignments.push({
					date: dateStr,
					slotId: `${dateStr}_CLOSING_STORE_DEFICIT`,
					startTime: '15:00',
					endTime: '20:15',
					assignedStaffId: '',
					storeDeficit: true,
					deficitReason: '⚠️ 未アサイン（閉店枠不足・要管理者補填）'
				});
			}
		}
	}

	const totalDuration = Date.now() - startLoopTime;
	console.log(`[Pure Math Solver] Completed in ${totalDuration}ms. Total slots: ${allSlots.length}`);
	return { assignments };
}

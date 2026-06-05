<!-- src/routes/admin/shifts/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import {
    type Staff,
    type UnicesEvent,
    type DailyShift,
    type ShiftAssignment,
    TIME_SLOTS,
    generateDailyShift,
    isStaffAvailable,
    parseDayOfWeek,
    normalizeWish
  } from '$lib/services/autoShiftService';
  import { 
    type Wish,
    getStaffDetails,
    saveStaffDetails,
    backupToNotion,
    getMonthlyConfirmedShifts
  } from '$lib/services/shiftService';
  import { authState } from '../../../lib/services/authService.svelte.ts';
  import { doc, collection, query, where, getDocs, writeBatch, Timestamp } from 'firebase/firestore';
  import { db } from '$lib/firebase';

  // 1. 実務スタッフデータ（17名） — CW / FS / UNICESタグ付き
  let staffs = $state<Staff[]>([
    { id: 'staff_01', uid: 'staff_01', name: '川本(管理者)', role: 'employee', hourlyWage: 1200, hourly_wage: 1200, targetIncomeMax: 50000, target_monthly_income: 50000, targetIncomeMin: 0, tags: ['CW', 'FS', 'UNICES'], age_group: 'adult' },
    { id: 'staff_02', uid: 'staff_02', name: '佐藤', role: 'employee', hourlyWage: 1100, hourly_wage: 1100, targetIncomeMax: 50000, target_monthly_income: 50000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_03', uid: 'staff_03', name: '田中', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 45000, target_monthly_income: 45000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_04', uid: 'staff_04', name: '山本', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 40000, target_monthly_income: 40000, targetIncomeMin: 0, tags: ['CW', 'UNICES'], age_group: 'adult' },
    { id: 'staff_05', uid: 'staff_05', name: '鈴木', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 35000, target_monthly_income: 35000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor', is_trainee: true },
    { id: 'staff_06', uid: 'staff_06', name: '高橋', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 30000, target_monthly_income: 30000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor', isTrainee: true },
    { id: 'staff_07', uid: 'staff_07', name: '渡辺', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 40000, target_monthly_income: 40000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_08', uid: 'staff_08', name: '伊藤', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 35000, target_monthly_income: 35000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_09', uid: 'staff_09', name: '中村', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 30000, target_monthly_income: 30000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_10', uid: 'staff_10', name: '小林', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 40000, target_monthly_income: 40000, targetIncomeMin: 0, tags: ['CW'], age_group: 'adult' },
    { id: 'staff_11', uid: 'staff_11', name: '加藤', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 35000, target_monthly_income: 35000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_12', uid: 'staff_12', name: '吉田', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 30000, target_monthly_income: 30000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_13', uid: 'staff_13', name: '山田', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 40000, target_monthly_income: 40000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_14', uid: 'staff_14', name: '佐々木', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 35000, target_monthly_income: 35000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_15', uid: 'staff_15', name: '山口', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 30000, target_monthly_income: 30000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_16', uid: 'staff_16', name: '松本', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 25000, target_monthly_income: 25000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_17', uid: 'staff_17', name: '井上', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 25000, target_monthly_income: 25000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor', isLateSubmission: true }
  ]);

  // 2. カレンダー年月選択状態
  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  let currentYear = $state(todayYear);
  let currentMonth = $state(todayMonth);

  // 3. 表示タブ選択 ('puzzle' または 'settings')
  let activeTab = $state<'puzzle' | 'settings'>('puzzle');

  // 4. データ取得用・格納状態（日付文字列 "YYYY-MM-DD" をキーとするリアクティブ辞書構造）
  let monthlyConfirmedShifts = $state<{ [dateStr: string]: DailyShift }>({});
  let wishesMapByDate = $state<{ [dateStr: string]: { [staffId: string]: Wish } }>({});
  
  // UNICES日別イベント情報 (キー: dateStr, デフォルト13:00-15:00, activeで有効化)
  let unicesEventsByDate = $state<{ [dateStr: string]: { startTime: string; endTime: string; active: boolean } }>({});

  // フリースクール日別開講情報 (キー: dateStr, active=開講日)
  let fsDaysByDate = $state<{ [dateStr: string]: { startTime: string; endTime: string; active: boolean } }>({});

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

  // ログインユーザー自身をスタッフ一覧へ動的追加 (テスト用に自希望を反映させるため)
  $effect(() => {
    if (authState.user && authState.user.uid) {
      const userUid = authState.user.uid;
      const exists = staffs.some(s => s.id === userUid || s.uid === userUid);
      if (!exists) {
        staffs = [
          {
            id: userUid,
            name: authState.user.name || '自分 (テスト管理者)',
            role: 'employee',
            targetIncomeMin: 180000,
            targetIncomeMax: 250000,
            hourlyWage: 1500,
            uid: userUid
          },
          ...staffs
        ];
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
    staffs.forEach(s => {
      let totalHours = 0;
      Object.values(monthlyConfirmedShifts).forEach(shift => {
        if (shift && shift.slots) {
          Object.values(shift.slots).forEach(assignments => {
            assignments.forEach(a => {
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
    staffs.forEach(s => {
      let total = 0;
      Object.values(monthlyConfirmedShifts).forEach(shift => {
        if (shift && shift.slots) {
          Object.values(shift.slots).forEach(assignments => {
            assignments.forEach(a => {
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
      unassignedStaffs: { staffId: string; staffName: string; role: 'employee' | 'adult' | 'minor' }[];
    }[] = [];

    // ローカルヘルパー関数 (各セルのアサインと時間を安全に算出)
    function getStaffRangeForCell(dateStr: string, staffId: string, area: 'cafe' | 'fs' | 'unices'): string {
      const shift = shifts[dateStr];
      if (!shift || !shift.slots) return '';

      const workingSlots = TIME_SLOTS.filter(slot => {
        const assignments = shift.slots[slot] || [];
        return assignments.some(a => a.staffId === staffId && a.area === area);
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

      TIME_SLOTS.forEach(slot => {
        const assignments = shift.slots[slot] || [];
        assignments.forEach(a => {
          if (a.area === area && !uniqueStaffIds.has(a.staffId)) {
            uniqueStaffIds.add(a.staffId);
            const range = getStaffRangeForCell(dateStr, a.staffId, area);
            const staffObj = staffList.find(s => s.id === a.staffId);
            const shortName = staffObj ? staffObj.name.replace(/\s*\(.*?\)/, '') : a.staffName.replace(/\s*\(.*?\)/, '');
            staffInfo.push({ id: a.staffId, name: shortName, range });
          }
        });
      });

      return staffInfo;
    }

    function checkCafeShortageForCell(dateStr: string): boolean {
      const shift = shifts[dateStr];
      if (!shift || !shift.slots) return true;

      return TIME_SLOTS.some(slot => {
        const assignments = shift.slots[slot] || [];
        const cafeCount = assignments.filter(a => a.area === 'cafe').length;
        const required = slot === '09:45' ? 1 : 2;
        return cafeCount < required;
      });
    }

    // FSエリア不足チェック (10:00-15:00 に2名)
    function checkFsShortageForCell(dateStr: string): boolean {
      const shift = shifts[dateStr];
      if (!shift || !shift.slots) return false;
      return TIME_SLOTS.some(slot => {
        if (!isSlotInInterval(slot, '10:00', '15:00')) return false;
        const fsCount = (shift.slots[slot] || []).filter(a => a.area === 'fs').length;
        return fsCount < 2;
      });
    }

    function checkUnicesShortageForCell(dateStr: string): boolean {
      const event = events[dateStr];
      if (!event || !event.active) return false;

      const shift = shifts[dateStr];
      if (!shift || !shift.slots) return true;

      return TIME_SLOTS.some(slot => {
        if (isSlotInInterval(slot, event.startTime, event.endTime)) {
          const assignments = shift.slots[slot] || [];
          const unicesCount = assignments.filter(a => a.area === 'unices').length;
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

  // UNICES 日別イベント情報の初期化（水曜と金曜にデフォルトイベントを適用）
  function initUnicesEvents(year: number, month: number) {
    const lastDay = new Date(year, month, 0).getDate();
    const map: { [dateStr: string]: { startTime: string; endTime: string; active: boolean } } = {};
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      // デフォルトで水曜(3)と金曜(5)にUNICESイベントがあることにする（テスト用ダミー）
      const active = (dayOfWeek === 3 || dayOfWeek === 5);
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

    // 1. 全ての曜日テンプレートを Firestore から一括フェッチしてマッピング
    const templatesMap: { [userId: string]: { [dayOfWeek: number]: { type: 'ng' | 'specific' | 'free'; startTime: string; endTime: string } } } = {};
    try {
      const snap = await getDocs(collection(db, 'weekly_templates'));
      snap.docs.forEach(docSnap => {
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
    } catch (e) {
      console.warn('Failed to fetch weekly templates, using defaults:', e);
    }

    // 2. Firestore から実際の提出済み希望を取得
    try {
      const q = query(
        collection(db, 'wishes'),
        where('date', '>=', startDateStr),
        where('date', '<=', endDateStr)
      );
      const snapshot = await getDocs(q);
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
    } catch (err) {
      console.warn('Firebase query wishes failed, using fallback/dummy seeding:', err);
    }

    // 3. テスト用に曜日テンプレート流し込み＆未提出者へのダミーシード
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const jsDate = parseLocalDate(dateStr);
      const dayOfWeek = jsDate.getDay(); // 0: 日, 1: 月, ...

      if (!wishesMap[dateStr]) {
        wishesMap[dateStr] = {};
      }

      staffs.forEach(s => {
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
            // テンプレートも無い場合のテスト用シード
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
            } else { // adult
              if (seed === 1 || seed === 2) {
                wishType = 'ng';
              } else if (seed === 3 || seed === 4) {
                wishType = 'specific';
                startTime = '15:00';
                endTime = '20:15';
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

          // テスト用に提出者と未提出者を混在させる (佐藤emp_1, 鈴木adu_1, 渡辺min_1, および自分は提出済み扱い。他は未提出扱い)
          const isUser = authState.user && (s.id === authState.user.uid || s.uid === authState.user.uid);
          // 17名全員を提出済み扱いにする（テスト用）
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

  // 月全体の確定シフトデータをロード
  async function loadMonthShifts(year: number, month: number) {
    isLoading = true;
    try {
      const fetchedShifts = await getMonthlyConfirmedShifts(year, month);
      
      const lastDay = new Date(year, month, 0).getDate();
      const newShiftsMap: { [dateStr: string]: DailyShift } = {};

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const existing = fetchedShifts.find(s => s.date === dateStr);
        if (existing) {
          newShiftsMap[dateStr] = existing;
        } else {
          newShiftsMap[dateStr] = { date: dateStr, slots: {} };
        }
      }
      monthlyConfirmedShifts = newShiftsMap;
    } catch (err) {
      console.error('Failed to load monthly confirmed shifts:', err);
    } finally {
      isLoading = false;
    }
  }

  // 月データ一括ロード処理
  async function loadMonthData() {
    isLoading = true;
    try {
      // 1. 全スタッフ情報を取得
      try {
        const loaded = await getStaffDetails(staffs);
        if (loaded && loaded.length > 0) {
          staffs = loaded;
        }
      } catch (e) {
        console.warn('Firebase staff details fetch skipped, using initial seed.', e);
      }

      // 2. 月全体の確定シフトを取得
      await loadMonthShifts(currentYear, currentMonth);

      // 3. 月全体の希望データを取得＆自動シード
      wishesMapByDate = await loadMonthWishes(currentYear, currentMonth);

      // 4. 初回ロード時に確定シフトがアサインゼロの場合、テスト用ドラフト自動生成
      const totalAssignments = Object.values(monthlyConfirmedShifts).reduce((acc, shift) => {
        const count = Object.values(shift.slots || {}).reduce((c, arr) => c + (arr?.length || 0), 0);
        return acc + count;
      }, 0);

      if (totalAssignments === 0) {
        console.log('No existing shifts found for this month, auto-generating initial draft...');
        triggerMonthlyAutoGenerate();
      }
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
    initUnicesEvents(currentYear, currentMonth);
    initFsDays(currentYear, currentMonth);
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
    initUnicesEvents(currentYear, currentMonth);
    initFsDays(currentYear, currentMonth);
    await loadMonthData();
  }

  function triggerMonthlyAutoGenerate() {
    isLoading = true;
    try {
      const year = currentYear;
      const month = currentMonth;
      const lastDay = new Date(year, month, 0).getDate();
      
      const newShiftsMap: { [dateStr: string]: DailyShift } = {};
      const currentAccruedHours: { [staffId: string]: number } = {};
      staffs.forEach(s => {
        currentAccruedHours[s.id] = 0;
      });

      // 遅延要望以外のスタッフのみを自動生成対象とする
      const activeStaffsForAuto = staffs.filter(s => !s.isLateSubmission);

      // 連勤判定用に、その月の中でこれまでに順次生成された日付アサインの進行履歴リストを蓄積
      const generatedList: DailyShift[] = [];

      // ローカル連勤チェックヘルパー
      function getConsecutiveDays(staffId: string, currentDateStr: string, generatedList: DailyShift[]): number {
        let count = 0;
        const currentDate = new Date(currentDateStr);
        for (let i = 1; i <= 31; i++) {
          const prevDate = new Date(currentDate);
          prevDate.setDate(currentDate.getDate() - i);
          const y = prevDate.getFullYear();
          const m = String(prevDate.getMonth() + 1).padStart(2, '0');
          const d = String(prevDate.getDate()).padStart(2, '0');
          const checkDateStr = `${y}-${m}-${d}`;

          const prevShift = generatedList.find(s => s.date === checkDateStr);
          if (!prevShift) break;

          const worked = Object.values(prevShift.slots).some(assignments =>
            assignments.some(a => a.staffId === staffId)
          );
          if (worked) {
            count++;
          } else {
            break;
          }
        }
        return count;
      }

      // ローカル土日出勤カウントヘルパー
      function getWeekendShiftCount(staffId: string, generatedList: DailyShift[]): number {
        let count = 0;
        generatedList.forEach(shift => {
          const d = new Date(shift.date);
          const dayOfWeek = d.getDay();
          if (dayOfWeek === 0 || dayOfWeek === 6) { // 日曜 または 土曜
            const worked = Object.values(shift.slots).some(assignments =>
              assignments.some(a => a.staffId === staffId && a.area === 'cafe')
            );
            if (worked) {
              count++;
            }
          }
        });
        return count;
      }

      // シャッフル用ヘルパー
      function shuffle<T>(array: T[]): T[] {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
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

      for (let d = 1; d <= lastDay; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        // 1日分の枠を初期化
        const slots: { [time: string]: ShiftAssignment[] } = {};
        TIME_SLOTS.forEach(slot => {
          slots[slot] = [];
        });

        const dayWishes = wishesMapByDate[dateStr] || {};
        const event = unicesEventsByDate[dateStr] || { startTime: '13:00', endTime: '15:00', active: false };
        const fsDay = fsDaysByDate[dateStr];

        // wishesの標準化
        const normalizedWishes: { [staffId: string]: ReturnType<typeof normalizeWish> } = {};
        staffs.forEach(s => {
          normalizedWishes[s.id] = normalizeWish(dayWishes[s.id]);
        });

        // --- Step 1: 日付ごとの「必要座席リスト（配列）」の動的生成 ---
        interface RequiredSeat {
          type: 'CW' | 'FS' | 'UNICES';
          slot: 'AM' | 'PM' | 'EVENT';
          startTime: string;
          endTime: string;
          label: string;
        }
        const requiredSeats: RequiredSeat[] = [];

        // 毎日必ず生成（ベース）: カフェ枠
        requiredSeats.push({ type: 'CW', slot: 'AM', startTime: '09:45', endTime: '15:00', label: 'カフェ前半' });
        requiredSeats.push({ type: 'CW', slot: 'AM', startTime: '09:45', endTime: '15:00', label: 'カフェ前半' });
        requiredSeats.push({ type: 'CW', slot: 'PM', startTime: '15:00', endTime: '20:15', label: 'カフェ後半' });
        requiredSeats.push({ type: 'CW', slot: 'PM', startTime: '15:00', endTime: '20:15', label: 'カフェ後半' });

        // FS開講日
        if (fsDay?.active) {
          requiredSeats.push({ type: 'FS', slot: 'AM', startTime: '09:45', endTime: '15:00', label: 'FS前半' });
          requiredSeats.push({ type: 'FS', slot: 'AM', startTime: '09:45', endTime: '15:00', label: 'FS前半' });
          requiredSeats.push({ type: 'FS', slot: 'PM', startTime: '15:00', endTime: '20:15', label: 'FS後半' });
          requiredSeats.push({ type: 'FS', slot: 'PM', startTime: '15:00', endTime: '20:15', label: 'FS後半' });
        }

        // UNICES開催日
        if (event.active) {
          requiredSeats.push({
            type: 'UNICES',
            slot: 'EVENT',
            startTime: event.startTime || '13:00',
            endTime: event.endTime || '15:00',
            label: 'UNICES枠'
          });
        }

        // --- Step 2: 席のタイプに応じた「希少順アサイン」の実行 ---
        // 優先度: UNICES(1) ➔ FS(2) ➔ CW(3)
        requiredSeats.sort((a, b) => {
          const priority = { 'UNICES': 1, 'FS': 2, 'CW': 3 };
          return priority[a.type] - priority[b.type];
        });

        // 重複時間帯勤務をスロット単位で衝突チェックするためのSet辞書
        const staffAssignedSlotsThisDay: { [staffId: string]: Set<string> } = {};
        staffs.forEach(s => {
          staffAssignedSlotsThisDay[s.id] = new Set<string>();
        });

        // 1席ずつ順番に埋める
        for (const seat of requiredSeats) {
          const seatSlots = TIME_SLOTS.filter(slot => isSlotInInterval(slot, seat.startTime, seat.endTime));
          if (seatSlots.length === 0) continue;

          // 絶対制約による候補者フィルタ
          const candidates = activeStaffsForAuto.filter(s => {
            // 1. 席のタイプに対応した役割タグを持っているか
            if (!(s.tags ?? []).includes(seat.type)) return false;

            // 2. 希望提出状況チェック
            const wish = normalizedWishes[s.id];
            if (!wish || wish.type === 'ng') return false;

            // 3. 希望時間との重なり（特定時間希望の場合）
            const targetSlots = wish.type === 'specific'
              ? seatSlots.filter(slot => isSlotInInterval(slot, wish.startTime, wish.endTime))
              : seatSlots;

            // 特定時間希望の場合、最低30分（2スロット）以上の重なりが必要
            if (wish.type === 'specific' && targetSlots.length < 2) return false;

            // 4. 重複時間帯の衝突チェック
            const hasOverlap = targetSlots.some(slot => staffAssignedSlotsThisDay[s.id].has(slot));
            if (hasOverlap) return false;

            // 5. UNICESは未成年不可
            if (seat.type === 'UNICES' && (s.age_group || s.role) === 'minor') return false;

            // 6. 未成年/研修生の相方制約（同一スロットに他の未成年/研修生がいないかチェック）
            const areaMap = { 'CW': 'cafe', 'FS': 'fs', 'UNICES': 'unices' } as const;
            const assignArea = areaMap[seat.type];
            let isPartnerConstraintViolated = false;
            for (const slot of targetSlots) {
              const assignedInSlot = slots[slot].filter(a => a.area === assignArea);
              for (const a of assignedInSlot) {
                const other = staffs.find(st => st.id === a.staffId);
                if (!other) continue;
                if (isMinorOrTrainee(s)) {
                  if (!isValidPartner(other)) {
                    isPartnerConstraintViolated = true;
                    break;
                  }
                } else {
                  if (isMinorOrTrainee(other) && !isValidPartner(s)) {
                    isPartnerConstraintViolated = true;
                    break;
                  }
                }
              }
              if (isPartnerConstraintViolated) break;
            }
            if (isPartnerConstraintViolated) return false;

            return true;
          });

          if (candidates.length === 0) continue;

          // 候補者のスコアリング
          const scoredCandidates = candidates.map(s => {
            const wish = normalizedWishes[s.id];
            const targetSlots = wish.type === 'specific'
              ? seatSlots.filter(slot => isSlotInInterval(slot, wish.startTime, wish.endTime))
              : seatSlots;

            // A. 希望日時マッチ（+100点）
            let isWishMatch = false;
            if (wish.type === 'free') {
              isWishMatch = true;
            } else if (wish.type === 'specific') {
              const wishStartMin = timeToMinutes(wish.startTime);
              const wishEndMin = timeToMinutes(wish.endTime);
              const seatStartMin = timeToMinutes(seat.startTime);
              const seatEndMin = timeToMinutes(seat.endTime);
              isWishMatch = wishStartMin <= seatStartMin && wishEndMin >= seatEndMin;
            }

            // B. 残り希望金額優先（困窮度）
            const targetIncome = s.target_monthly_income || s.targetIncomeMax || 40000;
            const wage = Number(s.hourlyWage || s.hourly_wage) || (s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100);
            const currentHours = (currentAccruedHours[s.id] || 0) + (staffAssignedSlotsThisDay[s.id]?.size || 0) * 0.25;
            const currentIncome = currentHours * wage;
            const incomeGap = targetIncome - currentIncome;

            // C. 連勤ペナルティ
            const consecutiveDays = getConsecutiveDays(s.id, dateStr, generatedList);

            // D. 土日出勤回数（同点時優先度判断用）
            const weekendCount = getWeekendShiftCount(s.id, generatedList);

            let score = 0;
            if (isWishMatch) {
              score += 100;
            }
            score += incomeGap;

            if (consecutiveDays === 2) {
              score -= 50;
            } else if (consecutiveDays >= 3) {
              score -= 1000;
            }

            return {
              staff: s,
              score,
              weekendCount,
              targetSlots
            };
          });

          // ランダム性を安全に担保するためソート前に候補者リストをシャッフル
          const shuffled = shuffle(scoredCandidates);

          // ソート：スコア（降順） -> 土日出勤回数（昇順）
          shuffled.sort((a, b) => {
            if (a.score !== b.score) {
              return b.score - a.score;
            }
            return a.weekendCount - b.weekendCount;
          });

          // 最も優先度の高いスタッフをアサイン
          const best = shuffled[0];
          const s = best.staff;
          const targetSlots = best.targetSlots;

          const areaMap = { 'CW': 'cafe', 'FS': 'fs', 'UNICES': 'unices' } as const;
          const assignArea = areaMap[seat.type];

          targetSlots.forEach(slot => {
            slots[slot].push({
              staffId: s.id,
              staffName: s.name,
              role: (s.age_group || s.role) === 'minor' ? 'minor' : (s.role === 'employee' ? 'employee' : 'adult'),
              area: assignArea,
              isRarePinned: false
            });
            staffAssignedSlotsThisDay[s.id].add(slot);
          });
        }

        // --- STEP D-0: 未成年/研修生の安全スイープ（ワンオペ・違反ペアの排除） ---
        TIME_SLOTS.forEach(slot => {
          (['cafe', 'fs', 'unices'] as const).forEach(area => {
            const areaAssignments = slots[slot].filter(a => a.area === area);
            if (areaAssignments.length === 0) return;

            // このスロット・エリアに未成年または研修生がいるか
            const hasMinorOrTrainee = areaAssignments.some(a => {
              const s = staffs.find(st => st.id === a.staffId);
              return s ? isMinorOrTrainee(s) : false;
            });

            if (hasMinorOrTrainee) {
              // 有効な相方（社員または成人かつFSタグ保持者）が少なくとも1人いるかチェック
              const hasValidPartner = areaAssignments.some(a => {
                const s = staffs.find(st => st.id === a.staffId);
                return s ? isValidPartner(s) : false;
              });

              // 有効な相方がいない場合、未成年/研修生のメンバーをこのスロットから排除
              if (!hasValidPartner) {
                slots[slot] = slots[slot].filter(a => {
                  if (a.area !== area) return true;
                  const s = staffs.find(st => st.id === a.staffId);
                  return s ? !isMinorOrTrainee(s) : true;
                });
              }
            }
          });
        });

        // --- STEP D-1: ワンオペ（単独配置）のクリアスイープ（カフェ & FS枠） ---
        TIME_SLOTS.forEach(slot => {
          if (slot !== '09:45') {
            (['cafe', 'fs'] as const).forEach(area => {
              const assignments = slots[slot].filter(a => a.area === area);
              if (assignments.length === 1) {
                slots[slot] = slots[slot].filter(a => a.area !== area);
              }
            });
          }
        });

        // --- STEP E: 時間・給与の実働確定カウント加算 ---
        staffs.forEach(s => {
          const workedSlots = TIME_SLOTS.filter(slot => {
            const assignments = slots[slot] || [];
            return assignments.some(a => a.staffId === s.id);
          });
          if (workedSlots.length > 0) {
            currentAccruedHours[s.id] += workedSlots.length * 0.25;
          }
        });

        // --- STEP F: あぶれた希望提出者（あぶれメンバー）のストック ---
        const allAssignedIds = new Set<string>();
        TIME_SLOTS.forEach(slot => {
          slots[slot].forEach(a => allAssignedIds.add(a.staffId));
        });

        const unassignedStaffs: { staffId: string; staffName: string; role: 'employee' | 'adult' | 'minor' }[] = [];
        staffs.forEach(s => {
          if (allAssignedIds.has(s.id)) return;
          const wish = dayWishes[s.id];
          if (wish && wish.type !== 'ng') {
            unassignedStaffs.push({
              staffId: s.id,
              staffName: s.name,
              role: (s.age_group || s.role) === 'minor' ? 'minor' : (s.role === 'employee' ? 'employee' : 'adult')
            });
          }
        });

        const generated: DailyShift = { date: dateStr, slots, unassignedStaffs };
        newShiftsMap[dateStr] = generated;
        generatedList.push(generated);
      }

      // Svelteが再描画を確実に検知できるよう、再代入を実行して一瞬で即時再描画させる！
      monthlyConfirmedShifts = { ...newShiftsMap };
    } catch (e) {
      console.error('Error generating monthly shifts:', e);
    } finally {
      isLoading = false;
    }
  }

  // 考慮度の変更ハンドラ
  function changeIncomeWeight(weight: 'none' | 'low' | 'high') {
    considerIncomeWeight = weight;
    triggerMonthlyAutoGenerate();
  }

  // カレンダーの日付セル用：スタッフ勤務時間範囲の取得
  function getStaffTimeRange(dateStr: string, staffId: string, area: 'cafe' | 'fs' | 'unices'): string {
    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift || !shift.slots) return '';

    const workingSlots = TIME_SLOTS.filter(slot => {
      const assignments = shift.slots[slot] || [];
      return assignments.some(a => a.staffId === staffId && a.area === area);
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

    TIME_SLOTS.forEach(slot => {
      const assignments = shift.slots[slot] || [];
      assignments.forEach(a => {
        if (a.area === area && !uniqueStaffIds.has(a.staffId)) {
          uniqueStaffIds.add(a.staffId);
          const range = getStaffTimeRange(dateStr, a.staffId, area);
          const staffObj = staffs.find(s => s.id === a.staffId);
          const shortName = staffObj ? staffObj.name.replace(/\s*\(.*?\)/, '') : a.staffName.replace(/\s*\(.*?\)/, '');
          staffInfo.push({ id: a.staffId, name: shortName, range });
        }
      });
    });

    return staffInfo;
  }

  // カフェ不足チェック (常時2名, 09:45は1名)
  function checkCafeShortage(dateStr: string): boolean {
    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift || !shift.slots) return true;

    return TIME_SLOTS.some(slot => {
      const assignments = shift.slots[slot] || [];
      const cafeCount = assignments.filter(a => a.area === 'cafe').length;
      const required = slot === '09:45' ? 1 : 2;
      return cafeCount < required;
    });
  }

  // UNICES不足チェック (イベント開催時間内に1人以上)
  function checkUnicesShortage(dateStr: string): boolean {
    const event = unicesEventsByDate[dateStr];
    if (!event || !event.active) return false;

    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift || !shift.slots) return true;

    return TIME_SLOTS.some(slot => {
      if (isSlotInInterval(slot, event.startTime, event.endTime)) {
        const assignments = shift.slots[slot] || [];
        const unicesCount = assignments.filter(a => a.area === 'unices').length;
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
  function removeStaffAssignmentDirectly(e: Event, dateStr: string, staffId: string, area: 'cafe' | 'fs' | 'unices') {
    e.stopPropagation(); // ポップオーバーが開くのを完全に防止
    
    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift) return;

    // ディープコピーして不変性を保証
    const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
      slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
    });

    monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
    monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
  }

  /**
   * あぶれメンバーを直接アサインする（空き枠埋め）
   */
  function quickAssignUnassignedStaff(staffId: string, dateStr: string, area: 'cafe' | 'fs' | 'unices') {
    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift) return;

    const staff = staffs.find(s => s.id === staffId);
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
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
    });

    // 該当スタッフをアサイン
    TIME_SLOTS.forEach(slot => {
      if (isSlotInInterval(slot, startStr, endStr)) {
        slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
        slotsCopy[slot].push({
          staffId: staff.id,
          staffName: staff.name,
          role: (staff.age_group || staff.role) === 'minor' ? 'minor' : (staff.role === 'employee' ? 'employee' : 'adult'),
          area: area
        });
      }
    });

    // あぶれリスト（unassignedStaffs）から除外
    const unassignedCopy = (shift.unassignedStaffs || []).filter(u => u.staffId !== staffId);

    // 確定シフト辞書を更新
    monthlyConfirmedShifts[dateStr] = { 
      ...shift, 
      slots: slotsCopy,
      unassignedStaffs: unassignedCopy
    };
    monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
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

    const unassignedStaff = staffs.find(s => s.id === unassignedStaffId);
    const assignedStaff = staffs.find(s => s.id === assignedStaffId);
    if (!unassignedStaff || !assignedStaff) return;

    // 交代される側の割り当てスロット情報を特定
    const assignedSlots: string[] = [];
    TIME_SLOTS.forEach(slot => {
      const assignments = shift.slots[slot] || [];
      if (assignments.some(a => a.staffId === assignedStaffId && a.area === area)) {
        assignedSlots.push(slot);
      }
    });

    if (assignedSlots.length === 0) return;

    // slotsをディープクローン
    const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
    });

    // 交代される側のスタッフを除外
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === assignedStaffId && a.area === area));
    });

    // あぶれメンバーをアサイン
    const wish = wishesMapByDate[dateStr]?.[unassignedStaffId];
    let startStr = '09:45';
    let endStr = '20:15';
    if (wish && wish.type === 'specific') {
      startStr = wish.startTime;
      endStr = wish.endTime;
    }

    assignedSlots.forEach(slot => {
      if (wish && wish.type === 'specific') {
        if (isSlotInInterval(slot, startStr, endStr)) {
          slotsCopy[slot].push({
            staffId: unassignedStaff.id,
            staffName: unassignedStaff.name,
            role: (unassignedStaff.age_group || unassignedStaff.role) === 'minor' ? 'minor' : (unassignedStaff.role === 'employee' ? 'employee' : 'adult'),
            area: area
          });
        }
      } else {
        slotsCopy[slot].push({
          staffId: unassignedStaff.id,
          staffName: unassignedStaff.name,
          role: (unassignedStaff.age_group || unassignedStaff.role) === 'minor' ? 'minor' : (unassignedStaff.role === 'employee' ? 'employee' : 'adult'),
          area: area
        });
      }
    });

    // あぶれリスト（unassignedStaffs）の更新
    let unassignedCopy = [...(shift.unassignedStaffs || [])];
    unassignedCopy = unassignedCopy.filter(u => u.staffId !== unassignedStaffId);
    if (!unassignedCopy.some(u => u.staffId === assignedStaffId)) {
      unassignedCopy.push({
        staffId: assignedStaff.id,
        staffName: assignedStaff.name,
        role: (assignedStaff.age_group || assignedStaff.role) === 'minor' ? 'minor' : (assignedStaff.role === 'employee' ? 'employee' : 'adult')
      });
    }

    // 確定シフト辞書を更新
    monthlyConfirmedShifts[dateStr] = { 
      ...shift, 
      slots: slotsCopy,
      unassignedStaffs: unassignedCopy
    };
    monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
  }

  // ポップオーバー内でのスタッフのアサイン切替トグル（ディープコピー不変マージ・即時再描画）
  function toggleStaffAssignmentInPopover(staffId: string) {
    const dateStr = popoverState.dateStr;
    const area = popoverState.area;
    if (!dateStr || !area) return;

    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift) return;

    const staff = staffs.find(s => s.id === staffId);
    if (!staff) return;

    // 不変性を確保するため、slotsおよびスロット配列を全てディープクローン
    const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
    });

    let isCurrentlyAssigned = false;
    TIME_SLOTS.forEach(slot => {
      if (slotsCopy[slot].some(a => a.staffId === staffId && a.area === area)) {
        isCurrentlyAssigned = true;
      }
    });

    if (isCurrentlyAssigned) {
      // 削除: このエリアのこのスタッフを綺麗に除外
      TIME_SLOTS.forEach(slot => {
        slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
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

      TIME_SLOTS.forEach(slot => {
        if (isSlotInInterval(slot, startStr, endStr)) {
          // すでに同じスロットに存在していれば重複排除したのち、配列に結合
          slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
          slotsCopy[slot].push({
            staffId: staff.id,
            staffName: staff.name,
            role: (staff.age_group || staff.role) === 'minor' ? 'minor' : (staff.role === 'employee' ? 'employee' : 'adult'),
            area: area
          });
        }
      });
    }

    // 辞書オブジェクト自体と該当日のオブジェクトを再代入し、Svelteに即時検知・描画させる！
    monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
    monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
  }

  // 直接テキスト変更時のインライン処理（ディープコピー不変マージ・即時再描画）
  function handlePopoverTimeChange(staffId: string, event: Event) {
    const dateStr = popoverState.dateStr;
    const area = popoverState.area;
    if (!dateStr || !area) return;

    const val = (event.target as HTMLInputElement).value.trim();
    const shift = monthlyConfirmedShifts[dateStr];
    if (!shift) return;

    const staff = staffs.find(s => s.id === staffId);
    if (!staff) return;

    // slotsをディープクローン
    const slotsCopy: { [time: string]: ShiftAssignment[] } = {};
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = shift.slots[slot] ? [...shift.slots[slot]] : [];
    });

    if (val === '') {
      // 空欄時はアサイン削除
      TIME_SLOTS.forEach(slot => {
        slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
      });
      monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
      monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
      return;
    }

    const parsed = parseRangeToSlots(val);
    if (!parsed) return;

    // 一旦既存のこの日付・エリアのアサインを全削除
    TIME_SLOTS.forEach(slot => {
      slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
    });

    // 新たなスロットにアサイン追加（他のスタッフは維持！）
    TIME_SLOTS.forEach(slot => {
      if (isSlotInInterval(slot, parsed.start, parsed.end)) {
        slotsCopy[slot] = slotsCopy[slot].filter(a => !(a.staffId === staffId && a.area === area));
        slotsCopy[slot].push({
          staffId: staff.id,
          staffName: staff.name,
          role: (staff.age_group || staff.role) === 'minor' ? 'minor' : (staff.role === 'employee' ? 'employee' : 'adult'),
          area: area
        });
      }
    });

    monthlyConfirmedShifts[dateStr] = { ...shift, slots: slotsCopy };
    monthlyConfirmedShifts = { ...monthlyConfirmedShifts };
  }

  // 時間テキストを綺麗にパースする
  function parseRangeToSlots(rangeStr: string): { start: string, end: string } | null {
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

  // 全日付の一括保存処理（Firestoreバッチ）
  async function handleSaveAllMonthlyShifts() {
    isLoading = true;
    try {
      const batch = writeBatch(db);
      
      Object.values(monthlyConfirmedShifts).forEach(shift => {
        if (shift && shift.date) {
          const docRef = doc(db, 'confirmed_shifts', shift.date);
          batch.set(docRef, {
            date: shift.date,
            slots: shift.slots || {},
            updatedAt: Timestamp.now()
          });
        }
      });

      await batch.commit();

      // バックグラウンドで Notion バックアップを並行トリガー
      isSyncingNotion = true;
      Promise.all(
        Object.values(monthlyConfirmedShifts).map(shift => {
          if (shift && shift.slots) {
            const hasAssignments = Object.values(shift.slots).some(arr => arr && arr.length > 0);
            if (hasAssignments) {
              return backupToNotion(shift);
            }
          }
          return Promise.resolve(true);
        })
      ).then(() => {
        isSyncingNotion = false;
        console.log('Notion month backup completed successfully.');
      });

      isSavedToast = true;
      setTimeout(() => {
        isSavedToast = false;
      }, 4000);
    } catch (err) {
      console.error('Error saving all monthly shifts:', err);
      alert('保存中にエラーが発生しました。');
    } finally {
      isLoading = false;
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

  // 空き枠テキストの生成用
  function getLineEmptySlotsText(year: number, month: number, shiftsMap: { [dateStr: string]: DailyShift }): string {
    let text = "お疲れ様です！シフトの原案を作成しました。\n以下の空き枠に入れる人がいれば、アプリから追加でスタンプ入力をお願いします！\n\n";
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
        const hasUnices = assignments.some(a => a.area === 'unices');
        const required = slot === '09:45' ? 1 : (hasUnices ? 3 : 2);
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
      return "お疲れ様としてシフトの原案を作成しました。\n現在、1日〜15日までの空き枠はありません！";
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
    if (s.role !== 'employee') {
      if (expected < 30000) {
        return { label: '要調整 (3万未満) ⚠️', class: 'bg-amber-50 text-amber-700 border-amber-250 font-bold' };
      } else if (expected >= 50000) {
        return { label: '超過注意 (5万以上) 🚨', class: 'bg-rose-50 text-rose-700 border-rose-250 font-bold animate-pulse' };
      } else {
        return { label: '適正 ✅', class: 'bg-emerald-50 text-emerald-700 border-emerald-250 font-semibold' };
      }
    }
    const minVal = Number(s.targetIncomeMin) || 40000;
    const maxVal = Number(s.targetIncomeMax) || 40000;
    if (minVal === 0 && maxVal === 0) return { label: '未設定', class: 'bg-slate-100 text-slate-600 border-slate-200' };
    if (expected < minVal) return { label: '不足 ⚠️', class: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' };
    if (expected > maxVal) return { label: '過剰 🚨', class: 'bg-rose-50 text-rose-700 border-rose-250 font-bold animate-pulse' };
    return { label: '適正 ✅', class: 'bg-emerald-50 text-emerald-700 border-emerald-250 font-semibold' };
  }

  // 初期化ロード
  onMount(async () => {
    initUnicesEvents(currentYear, currentMonth);
    await loadMonthData();
  });
</script>

<svelte:window onclick={handleWindowClick} />

<div class="min-h-screen bg-slate-50 text-slate-800 pb-32 font-sans transition-colors duration-300 ease-in-out">
  <div class="max-w-7xl mx-auto px-4 py-8 space-y-8">
    
    <!-- ヘッダー -->
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-slate-200">
      <div class="space-y-1">
        <div class="flex items-center gap-2">
          <a 
            href="/" 
            class="inline-flex items-center gap-1.5 bg-slate-150/80 hover:bg-slate-200/90 text-slate-600 hover:text-slate-800 text-[10px] font-bold py-1 px-3 rounded-full transition-all duration-300 border border-slate-200/70 shadow-sm cursor-pointer"
          >
            <span>← ホームへ戻る</span>
          </a>
        </div>
        <h1 class="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-2">
          <span>IPO Shift - 月間マトリクス・パズル調整</span>
        </h1>
        <p class="text-xs text-slate-500">情報を削ぎ落とした、1ヶ月全体を俯瞰して調整できるシフト決定用クリーン画面</p>
      </div>

      <!-- コントロールバー -->
      <div class="flex items-center gap-3 flex-wrap">
        <!-- タブ切り替え -->
        <div class="flex items-center gap-1 bg-white p-1 rounded-full border border-slate-200 shadow-sm text-xs select-none">
          <button 
            type="button"
            onclick={() => activeTab = 'puzzle'}
            class="px-4 py-1.5 rounded-full font-bold text-[10px] transition-all duration-300 cursor-pointer {activeTab === 'puzzle' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}"
          >
            🧩 パズル調整
          </button>
          <button 
            type="button"
            onclick={() => activeTab = 'settings'}
            class="px-4 py-1.5 rounded-full font-bold text-[10px] transition-all duration-300 cursor-pointer {activeTab === 'settings' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}"
          >
            ⚙️ 各種設定
          </button>
        </div>

        <!-- 月切り替えナビ -->
        <div class="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-slate-200 shadow-sm text-xs font-bold text-slate-700">
          <button type="button" onclick={handlePrevMonth} class="px-2 py-0.5 hover:bg-slate-100 rounded-full cursor-pointer transition flex items-center justify-center">◀</button>
          <span>{currentYear}年 {currentMonth}月</span>
          <button type="button" onclick={handleNextMonth} class="px-2 py-0.5 hover:bg-slate-100 rounded-full cursor-pointer transition flex items-center justify-center">▶</button>
        </div>

        <button 
          type="button"
          onclick={copyLineEmptySlotsText}
          class="bg-amber-500 hover:bg-amber-450 text-white font-bold text-xs py-2.5 px-4 rounded-full transition-all duration-300 ease-in-out shadow-sm flex items-center gap-1.5 hover:scale-[1.03] active:scale-95 cursor-pointer font-sans"
        >
          💬 空き枠コピー
        </button>
        <button 
          type="button"
          onclick={handleSaveAllMonthlyShifts}
          disabled={isLoading}
          class="bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-bold text-xs py-2.5 px-6 rounded-full transition-all duration-300 ease-in-out shadow-sm hover:scale-[1.03] active:scale-95 flex items-center gap-1.5 cursor-pointer font-sans"
        >
          {#if isLoading}
            <span class="animate-spin inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full"></span>
            <span>保存中...</span>
          {:else}
            <span>💾 全ての変更を保存</span>
          {/if}
        </button>
      </div>
    </header>

    <!-- メインコンテンツ -->
    {#if activeTab === 'puzzle'}
      <!-- 「🧩 パズル調整」メイン画面 -->
      <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        <!-- 左側：ツイン月間カレンダー (コピールーム・コワーキング / UNICES) -->
        <div class="lg:col-span-3 space-y-8 font-sans">
          
          <!-- カフェカレンダー -->
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div class="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>☕️</span>
                カフェ・コワーキング シフトパズル（常時2名）
              </h2>
              <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded bg-rose-50 border border-dashed border-rose-300 inline-block"></span>
                <span class="text-[9px] font-bold text-slate-400">薄赤破線: スタッフ不足（常時2名未満）</span>
              </div>
            </div>

            <!-- 曜日のヘッダー -->
            <div class="grid grid-cols-7 gap-2 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 font-mono">
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
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPopover(e, cell.dateStr, 'cafe'); }}
                  class="min-h-[90px] p-2 rounded-2xl border transition-all duration-300 text-left cursor-pointer flex flex-col justify-between relative select-none
                    {cell.isPadding ? 'bg-slate-50/50 border-slate-100 opacity-40 hover:bg-slate-50' : 'bg-white border-slate-200/80 hover:border-slate-350 hover:bg-slate-50/20'}
                    {cell.isCafeShortage && !cell.isPadding ? 'bg-rose-50/35 border-dashed border-rose-300 hover:bg-rose-50/60 shadow-[0_0_12px_rgba(244,63,94,0.02)]' : ''}
                  "
                >
                  <span class="text-[9px] font-bold {cell.isPadding ? 'text-slate-400' : 'text-slate-650'}">{cell.dayNum}</span>
                  
                  <!-- バッジ一覧 -->
                  <div class="space-y-1.5 mt-2 flex-1 flex flex-col justify-end">
                    {#each cell.cafeStaffs as staff}
                      <div class="text-[8px] font-extrabold px-2 py-0.5 rounded-lg flex items-center justify-between bg-emerald-50 border border-emerald-150/70 text-emerald-800 tracking-wider shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition hover:scale-[1.01] group relative">
                        <span class="truncate">{staff.name}</span>
                        <div class="flex items-center gap-1">
                          <span class="text-[7px] text-emerald-600/80 font-bold group-hover:hidden">{staff.range}</span>
                          <button 
                            type="button"
                            onclick={(e) => removeStaffAssignmentDirectly(e, cell.dateStr, staff.id, 'cafe')}
                            class="hidden group-hover:flex items-center justify-center w-3 h-3 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 text-[8px] font-extrabold cursor-pointer border-none transition"
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
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div class="flex justify-between items-center pb-4 border-b border-slate-100 mb-6">
              <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>🌐</span>
                UNICES シフトパズル（開催中1名）
              </h2>
              <div class="flex items-center gap-2">
                <span class="w-3.5 h-3.5 rounded bg-indigo-50 border border-indigo-200 inline-block"></span>
                <span class="text-[9px] font-bold text-slate-400">開催日のみスライド配置します</span>
              </div>
            </div>

            <!-- 曜日のヘッダー -->
            <div class="grid grid-cols-7 gap-2 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 font-mono">
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
                  onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openPopover(e, cell.dateStr, 'unices'); }}
                  class="min-h-[90px] p-2 rounded-2xl border transition-all duration-300 text-left cursor-pointer flex flex-col justify-between relative select-none
                    {cell.isPadding ? 'bg-slate-50/50 border-slate-100 opacity-40 hover:bg-slate-50' : 'bg-white border-slate-200/80 hover:border-slate-350 hover:bg-slate-50/20'}
                    {hasEvent && !cell.isPadding ? 'bg-indigo-50/10 border-indigo-200/80' : ''}
                    {cell.isUnicesShortage && !cell.isPadding ? 'bg-rose-50/35 border-dashed border-rose-300 hover:bg-rose-50/60 shadow-[0_0_12px_rgba(244,63,94,0.02)]' : ''}
                  "
                >
                  <div class="flex justify-between items-center">
                    <span class="text-[9px] font-bold {cell.isPadding ? 'text-slate-400' : 'text-slate-650'}">{cell.dayNum}</span>
                    {#if hasEvent && !cell.isPadding}
                      <span class="text-[7px] font-bold px-1 py-0.2 rounded bg-indigo-100 text-indigo-750 scale-90 origin-right">EVENT</span>
                    {/if}
                  </div>
                  
                  <!-- バッジ一覧 -->
                  <div class="space-y-1.5 mt-2 flex-1 flex flex-col justify-end">
                    {#each cell.unicesStaffs as staff}
                      <div class="text-[8px] font-extrabold px-2 py-0.5 rounded-lg flex items-center justify-between bg-indigo-50 border border-indigo-150/70 text-indigo-850 tracking-wider shadow-[0_1px_2px_rgba(0,0,0,0.01)] transition hover:scale-[1.01] group relative">
                        <span class="truncate">{staff.name}</span>
                        <div class="flex items-center gap-1">
                          <span class="text-[7px] text-indigo-600/80 font-bold group-hover:hidden">{staff.range}</span>
                          <button 
                            type="button"
                            onclick={(e) => removeStaffAssignmentDirectly(e, cell.dateStr, staff.id, 'unices')}
                            class="hidden group-hover:flex items-center justify-center w-3 h-3 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-700 text-[8px] font-extrabold cursor-pointer border-none transition"
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
        <div class="lg:col-span-1 space-y-6">
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] sticky top-6">
            <div class="pb-3 border-b border-slate-100 mb-5">
              <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span class="inline-block w-2.5 h-2.5 rounded-full bg-teal-500"></span>
                👥 給与・優先度アシスト
              </h2>
              <p class="text-[9px] text-slate-400 font-bold mt-1 uppercase tracking-wider">当月の合計稼働見込み</p>
            </div>

            <!-- 自動生成コントローラー -->
            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200/60 mb-6 space-y-3">
              <span class="text-[10px] font-bold text-slate-550 block font-sans">⚡ 自動生成（AI最適マッピング）</span>
              
              <!-- 考慮度選択 -->
              <div class="flex items-center gap-1 bg-white p-0.5 rounded-full border border-slate-200 shadow-xs text-xs select-none">
                <button 
                  type="button"
                  onclick={() => changeIncomeWeight('low')}
                  class="flex-1 text-center py-1 rounded-full font-bold text-[8px] transition-all duration-300 cursor-pointer {considerIncomeWeight === 'low' ? 'bg-teal-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}"
                >
                  ⚖️ バランス
                </button>
                <button 
                  type="button"
                  onclick={() => changeIncomeWeight('high')}
                  class="flex-1 text-center py-1 rounded-full font-bold text-[8px] transition-all duration-300 cursor-pointer {considerIncomeWeight === 'high' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}"
                >
                  🎯 希望重視
                </button>
                <button 
                  type="button"
                  onclick={() => changeIncomeWeight('none')}
                  class="flex-1 text-center py-1 rounded-full font-bold text-[8px] transition-all duration-300 cursor-pointer {considerIncomeWeight === 'none' ? 'bg-slate-200 text-slate-700 shadow-xs' : 'text-slate-400 hover:text-slate-600'}"
                >
                  ❌ オフ
                </button>
              </div>

              <button 
                type="button"
                onclick={triggerMonthlyAutoGenerate}
                class="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] py-2 px-4 rounded-full transition-all duration-300 shadow-xs flex items-center justify-center gap-1 hover:scale-[1.02] active:scale-95 cursor-pointer font-sans"
              >
                <span>⚡ 月間シフトを一括自動生成</span>
              </button>
            </div>

            <!-- スタッフ進捗リスト -->
            <div class="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              {#each staffs as s}
                {@const expected = staffExpectedWages[s.id] || 0}
                {@const hours = staffTotalHours[s.id] || 0}
                {@const status = getWageStatus(expected, s)}
                
                {@const staffTargetMin = (s.targetIncomeMin && Number(s.targetIncomeMin) > 0) ? Number(s.targetIncomeMin) : 40000}
                {@const staffTargetMax = (s.targetIncomeMax && Number(s.targetIncomeMax) > 0) ? Number(s.targetIncomeMax) : 40000}
                {@const targetMid = s.role !== 'employee' ? 50000 : ((staffTargetMin + staffTargetMax) / 2)}
                {@const percent = targetMid > 0 ? Math.min(100, Math.round((expected / targetMid) * 100)) : 0}
                
                <div class="bg-slate-50 p-3 rounded-2xl border border-slate-200/50 space-y-2.5 transition hover:bg-white duration-300 shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                  <!-- スタッフ名と状況バッジ -->
                  <div class="flex justify-between items-center font-sans">
                    <div>
                      <span class="font-bold text-xs text-slate-800">{s.name}</span>
                      <span class="text-[8px] text-slate-400 block mt-0.5 font-sans">当月合計: {hours.toFixed(1)}時間</span>
                    </div>
                    <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full border {status.class}">
                      {status.label}
                    </span>
                  </div>

                  <!-- 金額インジケーター -->
                  <div class="bg-white border border-slate-100/80 px-2.5 py-1.5 rounded-xl flex justify-between items-center text-[9px] font-sans">
                    <div>
                      <span class="text-slate-400 block font-medium scale-90 origin-left">見込み額</span>
                      <span class="font-extrabold text-slate-900">{expected.toLocaleString()}円</span>
                    </div>
                    <div class="text-right">
                      <span class="text-slate-400 block font-medium scale-90 origin-right">目標範囲</span>
                      <span class="font-semibold text-slate-600">
                        {#if s.role !== 'employee'}
                          3万〜5万
                        {:else}
                          {staffTargetMin.toLocaleString()}〜{staffTargetMax.toLocaleString()}
                        {/if}
                      </span>
                    </div>
                  </div>

                  <!-- プログレスバー -->
                  {#if targetMid > 0}
                    <div class="space-y-1 font-sans">
                      <div class="flex justify-between text-[8px] text-slate-455 font-bold uppercase tracking-wider scale-90 origin-left">
                        <span>進捗率</span>
                        <span>{percent}%</span>
                      </div>
                      <div class="w-full bg-slate-200/50 rounded-full h-1.5 overflow-hidden">
                        <div 
                          class="h-full rounded-full transition-all duration-500 
                            {status.label.includes('不足') ? 'bg-amber-400' : status.label.includes('超過') || status.label.includes('過剰') ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}"
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
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 font-sans">
        
        <!-- 左側：UNICESイベント時間設定 (2カラム分) -->
        <div class="lg:col-span-2 space-y-6">
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)]">
            <div class="pb-3 border-b border-slate-100 mb-6">
              <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>🌐</span>
                UNICES 開催日 ＆ 時間帯管理
              </h2>
              <p class="text-[10px] text-slate-400 mt-1">選択された月の全日付のUNICES開催の有無と時間を直接設定します。</p>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-h-[550px] overflow-y-auto pr-1">
              {#each calendarDays as cell}
                {#if !cell.isPadding}
                  {@const event = unicesEventsByDate[cell.dateStr]}
                  {#if event}
                    <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60 space-y-3 transition duration-200 hover:bg-white hover:shadow-xs">
                      <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-slate-700">{cell.dayNum}日 ({['日','月','火','水','木','金','土'][cell.dayOfWeek]})</span>
                        
                        <!-- 有効トグル -->
                        <label class="relative inline-flex items-center cursor-pointer select-none">
                          <input 
                            type="checkbox" 
                            bind:checked={event.active}
                            class="sr-only peer"
                          />
                          <div class="w-7 h-4 bg-slate-250 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-indigo-600"></div>
                        </label>
                      </div>

                      {#if event.active}
                        <div class="grid grid-cols-2 gap-2 text-[10px]">
                          <div>
                            <span class="text-slate-400 block mb-0.5 scale-90 origin-left">開始</span>
                            <input 
                              type="time" 
                              bind:value={event.startTime}
                              class="w-full bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-700 font-bold focus:outline-none focus:border-slate-355"
                            />
                          </div>
                          <div>
                            <span class="text-slate-400 block mb-0.5 scale-90 origin-left">終了</span>
                            <input 
                              type="time" 
                              bind:value={event.endTime}
                              class="w-full bg-white border border-slate-200 rounded-md px-1.5 py-0.5 text-slate-700 font-bold focus:outline-none focus:border-slate-355"
                            />
                          </div>
                        </div>
                      {:else}
                        <span class="text-[9px] text-slate-400 font-semibold block text-center py-2 italic bg-slate-100 rounded-lg font-sans">開催予定なし</span>
                      {/if}
                    </div>
                  {/if}
                {/if}
              {/each}
            </div>
          </section>
        </div>

        <!-- 右側：スタッフ詳細目標設定 (1カラム) -->
        <div class="lg:col-span-1">
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
            <div class="pb-3 border-b border-slate-100">
              <h2 class="text-sm font-bold text-slate-800 flex items-center gap-2">
                <span>👥</span>
                スタッフ時給・希望月収設定
              </h2>
              <p class="text-[10px] text-slate-400 mt-1">スタッフごとの基本時給と目標とする月給の範囲を管理します。</p>
            </div>

            <div class="space-y-4 max-h-[480px] overflow-y-auto pr-1">
              {#each staffs as s}
                <div class="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/60 space-y-3">
                  <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-slate-800">{s.name}</span>
                    <span class="text-[8px] font-bold px-2 py-0.5 rounded-full
                      {s.role === 'employee' ? 'bg-indigo-50 border border-indigo-100 text-indigo-650' : s.role === 'adult' ? 'bg-teal-50 border border-teal-100 text-teal-600' : 'bg-rose-50 border border-rose-100 text-rose-600'}">
                      {s.role === 'employee' ? '社員' : s.role === 'adult' ? '成人' : '未成年'}
                    </span>
                  </div>

                  <div class="grid grid-cols-3 gap-2 text-[10px] font-bold">
                    <div>
                      <span class="text-slate-400 block mb-0.5 scale-90 origin-left">時給 (円)</span>
                      <input 
                        type="number" 
                        bind:value={s.hourlyWage}
                        class="w-full bg-white border border-slate-200 rounded-md px-1.5 py-1 text-slate-700 font-bold focus:outline-none focus:border-slate-350"
                      />
                    </div>
                    <div>
                      <span class="text-slate-400 block mb-0.5 scale-90 origin-left">希望下限</span>
                      <input 
                        type="number" 
                        bind:value={s.targetIncomeMin}
                        class="w-full bg-white border border-slate-200 rounded-md px-1.5 py-1 text-slate-700 font-bold focus:outline-none focus:border-slate-350"
                      />
                    </div>
                    <div>
                      <span class="text-slate-400 block mb-0.5 scale-90 origin-left">希望上限</span>
                      <input 
                        type="number" 
                        bind:value={s.targetIncomeMax}
                        class="w-full bg-white border border-slate-200 rounded-md px-1.5 py-1 text-slate-700 font-bold focus:outline-none focus:border-slate-350"
                      />
                    </div>
                  </div>
                </div>
              {/each}
            </div>

            <div class="pt-4 border-t border-slate-100">
              <button 
                type="button"
                onclick={saveAllStaffDetails}
                class="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs py-2 px-4 rounded-full transition-all duration-300 shadow-sm flex items-center justify-center gap-1 hover:scale-[1.02] active:scale-95 cursor-pointer font-sans"
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
    {@const currentCell = calendarDays.find(c => c.dateStr === dateStr)}
    {@const unassignedList = currentCell?.unassignedStaffs || []}
    {@const assignedList = area === 'cafe' ? currentCell?.cafeStaffs : currentCell?.unicesStaffs}
    {@const limit = area === 'cafe' ? 2 : 1}
    
    <div 
      role="presentation"
      onclick={(e) => e.stopPropagation()}
      class="absolute bg-white/95 backdrop-blur-md border border-slate-200/80 p-4 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.08)] z-40 w-72 animate-in fade-in zoom-in-95 duration-200 font-sans"
      style="left: {popoverState.x}px; top: {popoverState.y}px;"
    >
      <div class="flex justify-between items-center pb-2 border-b border-slate-100 mb-3">
        <span class="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
          <span>{area === 'cafe' ? '☕️' : '🌐'}</span>
          <span>{formattedDate} - {area === 'cafe' ? 'カフェ' : 'UNICES'}</span>
        </span>
        <button 
          type="button" 
          onclick={() => popoverState.isOpen = false}
          class="text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer font-bold flex items-center justify-center"
        >
          ✕
        </button>
      </div>

      <!-- 希望提出者とアサイン操作 -->
      <div class="space-y-2 max-h-60 overflow-y-auto pr-1">
        {#each staffs as s}
          {@const wish = wishesMapByDate[dateStr]?.[s.id]}
          {@const range = getStaffTimeRange(dateStr, s.id, area)}
          {@const isAssigned = range !== ''}
          
          <div class="flex flex-col gap-1.5 p-2 rounded-xl transition duration-200 {isAssigned ? 'bg-slate-50 border border-slate-200/60 shadow-[0_1px_2px_rgba(0,0,0,0.01)]' : 'hover:bg-slate-50/50 border border-transparent'}">
            <div 
              role="button"
              tabindex="0"
              onclick={() => toggleStaffAssignmentInPopover(s.id)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleStaffAssignmentInPopover(s.id); }}
              class="flex items-center justify-between cursor-pointer"
            >
              <div class="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={isAssigned}
                  class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer pointer-events-none"
                  tabindex="-1"
                />
                <span class="text-xs font-bold text-slate-700">{s.name}</span>
              </div>
              
              <!-- 希望ステータス -->
              <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-md scale-95
                {!wish ? 'bg-slate-100 text-slate-400' : 
                 wish.type === 'free' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100/50' : 
                 wish.type === 'specific' ? 'bg-sky-50 text-sky-600 border border-sky-100/50' : 
                 'bg-rose-50 text-rose-500 border border-rose-100/50'}
              ">
                {!wish ? '未提出' : wish.type === 'free' ? '終日可' : wish.type === 'specific' ? `${wish.startTime}-${wish.endTime}` : '休み'}
              </span>
            </div>

            <!-- 時間直接編集 (アサイン時のみ出現) -->
            {#if isAssigned}
              <div class="flex items-center gap-1.5 pl-6 animate-in slide-in-from-left-2 duration-150 font-sans">
                <span class="text-[8px] text-slate-400 font-bold uppercase tracking-wider">時間:</span>
                <input 
                  type="text"
                  value={range}
                  onchange={(e) => handlePopoverTimeChange(s.id, e)}
                  placeholder="例: 10:00-15:00"
                  class="w-full bg-white border border-slate-200 hover:border-slate-350 focus:border-indigo-400 rounded-lg px-2 py-0.5 text-[9px] text-slate-800 font-extrabold focus:outline-none transition shadow-xs"
                />
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- あぶれ希望提出者（未配属メンバー）のクイック調整 -->
      {#if unassignedList.length > 0}
        <div class="mt-4 pt-3 border-t border-slate-200/80 space-y-2">
          <span class="text-[9px] font-extrabold text-slate-500 uppercase tracking-wider block">
            📌 あぶれ希望者 ({unassignedList.length}名)
          </span>
          <div class="space-y-1.5 max-h-36 overflow-y-auto pr-0.5">
            {#each unassignedList as u}
              <div class="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200/50 text-[10px] gap-2">
                <div class="flex flex-col gap-0.5 min-w-0">
                  <span class="font-extrabold text-slate-700 truncate">{u.staffName}</span>
                  <span class="text-[8px] font-bold text-slate-400">
                    {u.role === 'employee' ? '社員' : u.role === 'adult' ? '成人' : '未成年'}
                  </span>
                </div>
                
                <div class="flex items-center gap-1 shrink-0">
                  {#if (assignedList?.length || 0) < limit}
                    <button
                      type="button"
                      onclick={() => quickAssignUnassignedStaff(u.staffId, dateStr, area)}
                      class="bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[8px] px-2 py-1 rounded-lg transition-all duration-200 cursor-pointer shadow-xs border-none"
                    >
                      ⚡️ 配置
                    </button>
                  {:else}
                    {#each assignedList || [] as assigned}
                      <button
                        type="button"
                        onclick={() => swapStaffAssignments(u.staffId, assigned.id, dateStr, area)}
                        class="bg-amber-500 hover:bg-amber-450 text-white font-extrabold text-[8px] px-1.5 py-1 rounded-lg transition-all duration-200 cursor-pointer shadow-xs border-none"
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
    <div class="fixed bottom-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200/80 px-6 py-4 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] z-50 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-sans">
      <span class="text-xl">🎉</span>
      <div>
        <p class="text-xs font-bold text-slate-800">月間シフトを確定・保存しました</p>
        <p class="text-[10px] text-slate-400 font-semibold mt-0.5">
          {#if isSyncingNotion}
            <span class="text-indigo-600 animate-pulse">🔄 Notion バックアップを実行中...</span>
          {:else}
            <span class="text-emerald-600">✅ Notion バックアップと同期されました（保険）</span>
          {/if}
        </p>
      </div>
    </div>
  {/if}

  {#if isStaffSavedToast}
    <div class="fixed bottom-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200/80 px-6 py-4 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] z-50 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-sans">
      <span class="text-xl">⚙️</span>
      <div>
        <p class="text-xs font-bold text-slate-800">スタッフ設定を保存しました</p>
        <p class="text-[10px] text-slate-400 font-medium mt-0.5">データベースに時給・目標希望月収設定が同期されました。</p>
      </div>
    </div>
  {/if}

  {#if isCopiedToast}
    <div class="fixed bottom-6 right-6 bg-white/95 backdrop-blur-md border border-slate-200/80 px-6 py-4 rounded-3xl shadow-[0_12px_40px_rgba(0,0,0,0.06)] z-50 flex items-center gap-3 animate-in slide-in-from-bottom-4 duration-300 font-sans">
      <span class="text-xl">📋</span>
      <div>
        <p class="text-xs font-bold text-slate-800">LINE用の空き枠をコピーしました</p>
        <p class="text-[10px] text-slate-400 font-medium mt-0.5">クリップボードにテキストが保存されました。</p>
      </div>
    </div>
  {/if}

</div>

<!-- src/routes/wishes/+page.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, scale, slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    type WeeklyTemplate,
    type Wish,
    type SystemSettings,
    getWeeklyTemplates,
    saveWeeklyTemplates,
    generateMonthlyWishes,
    saveWish,
    submitMonthlyWishes,
    getSubmitStatus,
    getConfirmedShift,
    backupWishesToNotion,
    getMonthlyConfirmedShifts,
    getStaffDetails,
    parseLocalDate
  } from '$lib/services/shiftService';
  import {
    type Staff,
    type DailyShift,
    TIME_SLOTS,
    generateDailyShift,
    isStaffAvailable
  } from '$lib/services/autoShiftService';
  import { Timestamp, doc, getDoc, setDoc } from 'firebase/firestore';
  import { db } from '$lib/firebase';
  import { authState } from '../../lib/services/authService.svelte.ts';

  // 1. 基本設定・ユーザー
  let userId = $state(authState.user?.uid || 'staff_03');
  let userIsUnlocked = $state(false); // 個別解除トグル

  // 2. タブ制御 ('shifts' = みんなのシフト, 'wishes' = 希望提出, 'templates' = 曜日別テンプレート)
  let activeTab = $state<'shifts' | 'wishes' | 'templates'>('wishes');

  // 「みんなのシフト」用のFirestore連携
  let staffs = $state<Staff[]>([
    { id: 'staff_01', uid: 'staff_01', name: '川本(管理者)', role: 'employee', hourlyWage: 1200, hourly_wage: 1200, targetIncomeMax: 50000, target_monthly_income: 50000, targetIncomeMin: 0, tags: ['CW', 'FS', 'UNICES'], age_group: 'adult' },
    { id: 'staff_02', uid: 'staff_02', name: '佐藤', role: 'employee', hourlyWage: 1100, hourly_wage: 1100, targetIncomeMax: 50000, target_monthly_income: 50000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_03', uid: 'staff_03', name: '田中', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 45000, target_monthly_income: 45000, targetIncomeMin: 0, tags: ['CW', 'FS'], age_group: 'adult' },
    { id: 'staff_04', uid: 'staff_04', name: '山本', role: 'staff', hourlyWage: 1000, hourly_wage: 1000, targetIncomeMax: 40000, target_monthly_income: 40000, targetIncomeMin: 0, tags: ['CW', 'UNICES'], age_group: 'adult' },
    { id: 'staff_05', uid: 'staff_05', name: '鈴木', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 35000, target_monthly_income: 35000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
    { id: 'staff_06', uid: 'staff_06', name: '高橋', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 30000, target_monthly_income: 30000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' },
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
    { id: 'staff_17', uid: 'staff_17', name: '井上', role: 'staff', hourlyWage: 980, hourly_wage: 980, targetIncomeMax: 25000, target_monthly_income: 25000, targetIncomeMin: 0, tags: ['CW'], age_group: 'minor' }
  ]);

  // 同期用 $effect (ユーザーID更新)
  $effect(() => {
    if (authState.user && userId !== authState.user.uid) {
      userId = authState.user.uid;
    }
  });

  // カレンダー自動ロード $effect (targetYear, targetMonth, userId のいずれかの変更を監視)
  $effect(() => {
    const y = targetYear;
    const m = targetMonth;
    const uid = userId;
    if (uid) {
      loadCalendar(true);
    }
  });

  let monthlyConfirmedShifts = $state<DailyShift[]>([]);

  // 今日ベースの動的スケジュール管理
  let today = $state(new Date());

  // 常に現在の月の翌月を自動計算
  let targetYear = $derived.by(() => {
    let y = today.getFullYear();
    let m = today.getMonth() + 1; // 1-indexed
    let nextM = m + 1;
    if (nextM > 12) {
      y += 1;
    }
    return y;
  });

  let targetMonth = $derived.by(() => {
    let m = today.getMonth() + 1; // 1-indexed
    let nextM = m + 1;
    if (nextM > 12) {
      nextM = 1;
    }
    return nextM;
  });

  let deadlineYear = $derived(targetMonth === 1 ? targetYear - 1 : targetYear);
  let deadlineMonth = $derived(targetMonth === 1 ? 12 : targetMonth - 1);

  // 「みんなのシフト」表示制御 (false = 自分のみ, true = 全員分)
  let showAllShifts = $state(true); // 全員分をデフォルトにして一覧を見えやすく調整

  // 詳細ポップアップ用のステート
  let detailModalDay = $state<{ dateStr: string; day: number; dailyShift?: DailyShift } | null>(null);
  let isDetailModalOpen = $state(false);

  // 7列カレンダーグリッド用セルの算出（店舗全体シフト用）
  let shiftCalendarCells = $derived.by(() => {
    const cells: { dateStr: string; day: number; isEmpty: boolean; dailyShift?: DailyShift }[] = [];
    
    // 対象月の1日の曜日 (0: 日曜日, ..., 6: 土曜日)
    const firstDayOfWeek = new Date(targetYear, targetMonth - 1, 1).getDay();
    
    // 今月の日数
    const totalDays = new Date(targetYear, targetMonth, 0).getDate();

    // 先月分の空白セルを挿入
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ dateStr: '', day: 0, isEmpty: true });
    }

    // 今月の日数を挿入
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dailyShift = monthlyConfirmedShifts.find(s => s.date === dateStr);
      cells.push({
        dateStr,
        day,
        isEmpty: false,
        dailyShift
      });
    }

    return cells;
  });

  // 時間に15分を加算するヘルパー
  function add15Minutes(timeStr: string): string {
    const [h, m] = timeStr.split(':').map(Number);
    let newM = m + 15;
    let newH = h;
    if (newM >= 60) {
      newM -= 60;
      newH += 1;
    }
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }

  interface StaffShiftTime {
    staffId: string;
    staffName: string;
    role: 'employee' | 'adult' | 'minor';
    timeRangeStr: string;
  }

  // 1日のアサイン情報から各スタッフの連続勤務時間を集計して並べ替える
  function getStaffWorkingHoursForDay(dailyShift: DailyShift | undefined | null, staffsList: Staff[]): StaffShiftTime[] {
    if (!dailyShift || !dailyShift.slots) return [];

    const staffSlots = new Map<string, number[]>();
    const staffInfo = new Map<string, { name: string; role: 'employee' | 'adult' | 'minor' }>();

    TIME_SLOTS.forEach((slot, slotIdx) => {
      const assignments = dailyShift.slots[slot] || [];
      assignments.forEach((assign) => {
        if (!staffSlots.has(assign.staffId)) {
          staffSlots.set(assign.staffId, []);
          staffInfo.set(assign.staffId, { name: assign.staffName, role: assign.role });
        }
        staffSlots.get(assign.staffId)!.push(slotIdx);
      });
    });

    const results: StaffShiftTime[] = [];

    staffSlots.forEach((indices, staffId) => {
      indices.sort((a, b) => a - b);
      const blocks: { startIdx: number; endIdx: number }[] = [];
      if (indices.length > 0) {
        let startIdx = indices[0];
        let prevIdx = indices[0];

        for (let i = 1; i < indices.length; i++) {
          const currIdx = indices[i];
          if (currIdx === prevIdx + 1) {
            prevIdx = currIdx;
          } else {
            blocks.push({ startIdx, endIdx: prevIdx });
            startIdx = currIdx;
            prevIdx = currIdx;
          }
        }
        blocks.push({ startIdx, endIdx: prevIdx });
      }

      const rangeStrings = blocks.map((block) => {
        const startStr = TIME_SLOTS[block.startIdx];
        const endStr = add15Minutes(TIME_SLOTS[block.endIdx]);
        return `${startStr}-${endStr}`;
      });

      const info = staffInfo.get(staffId);
      if (info) {
        results.push({
          staffId,
          staffName: info.name,
          role: info.role,
          timeRangeStr: rangeStrings.join(', ')
        });
      }
    });

    const rolePriority = { employee: 0, adult: 1, minor: 2 };
    results.sort((a, b) => {
      const pA = rolePriority[a.role] ?? 99;
      const pB = rolePriority[b.role] ?? 99;
      if (pA !== pB) return pA - pB;
      return a.staffName.localeCompare(b.staffName);
    });

    return results;
  }

  // 自分がシフトに入っているか判定する
  function isMyShift(dailyShift: DailyShift | undefined | null, currentUserId: string): boolean {
    if (!dailyShift || !dailyShift.slots) return false;
    return Object.values(dailyShift.slots).some(assignments =>
      assignments.some(assign => assign.staffId === currentUserId)
    );
  }

  // 店舗全体カレンダーでセルをクリックした時の処理
  function onShiftCellClick(cell: { dateStr: string; day: number; isEmpty: boolean; dailyShift?: DailyShift }) {
    if (cell.isEmpty) return;
    detailModalDay = cell;
    isDetailModalOpen = true;
  }

  // 3. 曜日テンプレートのステート (Layer 1)
  let weeklyTemplates = $state<WeeklyTemplate[]>([]);

  // タイムスライダー用数値・文字変換ヘルパー
  function minutesToTimeStr(min: number): string {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  interface TemplateStamp {
    id: 'free' | 'ng' | 'fixed' | 'custom';
    label: string;
    icon: string;
    colorClass: string;
  }

  const templateStamps: TemplateStamp[] = [
    { id: 'free', label: '終日おまかせ', icon: '✅', colorClass: 'text-slate-650 border-slate-200 bg-slate-50' },
    { id: 'ng', label: '終日NG', icon: '❌', colorClass: 'text-rose-650 border-rose-200 bg-rose-50' },
    { id: 'fixed', label: '固定枠 (09:45-15:00)', icon: '🌅', colorClass: 'text-sky-650 border-sky-200 bg-sky-50' },
    { id: 'custom', label: 'カスタム時間', icon: '📝', colorClass: 'text-amber-650 border-amber-200 bg-amber-50' }
  ];

  let activeTemplateStampId = $state<'free' | 'ng' | 'fixed' | 'custom'>('free');
  let customStartMinutes = $state(585); // 09:45
  let customEndMinutes = $state(1080); // 18:00

  // スライダーの値が交差しないようにする監視リアクティブエフェクト
  $effect(() => {
    if (customStartMinutes >= customEndMinutes) {
      customEndMinutes = Math.min(1215, customStartMinutes + 15);
    }
  });

  // 4. カレンダーの個別例外ステート (Layer 2)
  let overriddenWishes = $state<{ [dateStr: string]: Wish }>({});
  let isLoading = $state(false);
  let isSubmitted = $state(false); // 対象月が提出済みロック状態にあるかのフラグ

  // インライン編集＆コンテキストメニュー状態
  let editingDateStr = $state<string | null>(null);
  let editingInputVal = $state<string>('');
  let activeMenuDate = $state<string | null>(null);

  // 5. スタンプパレット of definition と選択ステート
  interface Stamp {
    id: string;
    label: string;
    icon: string;
    type: 'free' | 'ng' | 'specific';
    startTime: string;
    endTime: string;
    colorClass: string;
    bgClass: string;
  }

  const stamps: Stamp[] = [
    { id: 'free', label: 'おまかせ', icon: '✅', type: 'free', startTime: '09:45', endTime: '20:15', colorClass: 'text-slate-650 border-slate-200 bg-slate-50', bgClass: 'bg-slate-100' },
    { id: 'ng', label: 'NG', icon: '❌', type: 'ng', startTime: '', endTime: '', colorClass: 'text-rose-650 border-rose-200 bg-rose-50', bgClass: 'bg-rose-100' },
    { id: 'fixed1', label: '固定枠1 (09:45-15:00)', icon: '🌅', type: 'specific', startTime: '09:45', endTime: '15:00', colorClass: 'text-sky-650 border-sky-200 bg-sky-50', bgClass: 'bg-sky-100' },
    { id: 'fixed2', label: '固定枠2 (15:00-20:15)', icon: '🌇', type: 'specific', startTime: '15:00', endTime: '20:15', colorClass: 'text-indigo-650 border-indigo-200 bg-indigo-50', bgClass: 'bg-indigo-100' },
    { id: 'custom', label: 'カスタム時間を入れる', icon: '⏰', type: 'specific', startTime: '10:00', endTime: '18:00', colorClass: 'text-amber-650 border-amber-200 bg-amber-50', bgClass: 'bg-amber-100' }
  ];

  let selectedStampId = $state<string>('free');

  // 6. システム締め切り設定（デモ用＆25日締めルール自動算出）
  let isSystemLocked = $state(false);
  
  // 今日の月ベースの締め切り日（当月の25日 23:59）を動的に計算
  let deadlineDate = $derived.by(() => {
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-25`;
  });
  let deadlineTime = $state('23:59');

  // derivedステート: 締め切り日時をTimestampへ変換
  let systemSettings = $derived.by<SystemSettings>(() => {
    if (!deadlineDate || !deadlineTime) {
      return { isLocked: isSystemLocked, deadline: null };
    }
    const dateObj = new Date(`${deadlineDate}T${deadlineTime}`);
    return {
      isLocked: isSystemLocked,
      deadline: Timestamp.fromDate(dateObj)
    };
  });

  // derivedステート: 締め切り・ロック状態の最終判定
  let isDeadlinePassed = $derived.by(() => {
    return today.getDate() > 25;
  });

  let isLocked = $derived.by(() => {
    // 締切を過ぎている場合は、修正要望（遅延提出）として操作・提出を許可するためロックしない！
    if (isDeadlinePassed) {
      return false;
    }
    if (isSubmitted) {
      return !userIsUnlocked;
    }
    if (systemSettings.isLocked) {
      return !userIsUnlocked;
    }
    return false;
  });


  // 7. Layer 1（固定） と Layer 2（例外） のリアルタイム合成による wishes derived ステート
  let wishes = $derived.by<Wish[]>(() => {
    const lastDay = new Date(targetYear, targetMonth, 0).getDate();
    const list: Wish[] = [];

    // テンプレートの曜日別マッピング
    const templateMap = new Map<number, WeeklyTemplate[]>();
    weeklyTemplates.forEach((t) => {
      const dayOfWeekKey = Number(t.dayOfWeek);
      if (!templateMap.has(dayOfWeekKey)) {
        templateMap.set(dayOfWeekKey, []);
      }
      templateMap.get(dayOfWeekKey)!.push(t);
    });

    for (let day = 1; day <= lastDay; day++) {
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Layer 2: 例外上書きがあればそれを最優先
      if (overriddenWishes[dateStr]) {
        list.push({
          ...overriddenWishes[dateStr],
          isSubmitted
        });
        continue;
      }

      // Layer 1: テンプレート適用、無ければデフォルト(free)
      const jsDate = new Date(targetYear, targetMonth - 1, day);
      const dayOfWeek = jsDate.getDay();
      const dayTemplates = templateMap.get(dayOfWeek) || [];

      if (dayTemplates.length > 0) {
        const primaryTemplate = dayTemplates[0];
        list.push({
          date: dateStr,
          type: primaryTemplate.type,
          startTime: primaryTemplate.startTime,
          endTime: primaryTemplate.endTime,
          isOverridden: false,
          isSubmitted
        });
      } else {
        list.push({
          date: dateStr,
          type: 'free',
          startTime: '09:45',
          endTime: '20:15',
          isOverridden: false,
          isSubmitted
        });
      }
    }

    return list;
  });

  // 8. 7列カレンダーグリッド用セルの算出
  let calendarCells = $derived.by(() => {
    const cells: { dateStr: string; day: number; isEmpty: boolean; wish?: Wish }[] = [];
    
    // 対象月の1日の曜日 (0: 日曜日, ..., 6: 土曜日)
    const firstDayOfWeek = new Date(targetYear, targetMonth - 1, 1).getDay();
    
    // 今月の日数
    const totalDays = new Date(targetYear, targetMonth, 0).getDate();

    // 先月分の空白セルを挿入
    for (let i = 0; i < firstDayOfWeek; i++) {
      cells.push({ dateStr: '', day: 0, isEmpty: true });
    }

    // 今月の日数を挿入
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const wish = wishes.find(w => w.date === dateStr);
      cells.push({
        dateStr,
        day,
        isEmpty: false,
        wish
      });
    }

    return cells;
  });

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // 9. 希望月収インジケーター用リアルタイム計算
  let currentUser = $derived(staffs.find(s => s.id === userId));
  let hourlyWage = $derived(currentUser?.hourlyWage || currentUser?.hourly_wage || 1200);
  let targetIncomeMin = $derived(currentUser?.targetIncomeMin || 0);
  let targetIncomeMax = $derived(currentUser?.target_monthly_income || currentUser?.targetIncomeMax || 0);

  // 編集用の目標希望月収ローカルステート
  let targetMonthlyIncomeInput = $state(0);

  // currentUserのロード時、あるいは切り替え時にローカルステートに初期値を同期
  $effect(() => {
    if (currentUser) {
      targetMonthlyIncomeInput = currentUser.target_monthly_income || currentUser.targetIncomeMax || 0;
    }
  });

  // 目標希望月収入力値に即座に同期・反映される derived
  let targetMid = $derived(targetMonthlyIncomeInput > 0 ? targetMonthlyIncomeInput : (targetIncomeMax > 0 ? targetIncomeMax : 50000));

  function getWishHours(wish: Wish): number {
    if (wish.type === 'ng') return 0;
    if (wish.type === 'free') {
      // おまかせの場合は実質的なパートタイム上限の5時間枠として計算
      return 5;
    }
    // specific
    if (!wish.startTime || !wish.endTime) return 0;
    const [sh, sm] = wish.startTime.split(':').map(Number);
    const [eh, em] = wish.endTime.split(':').map(Number);
    const diffMin = (eh * 60 + em) - (sh * 60 + sm);
    return Math.max(0, diffMin / 60);
  }

  let totalWishHours = $derived(wishes.reduce((sum, w) => sum + getWishHours(w), 0));
  let expectedMonthlyWage = $derived(Math.round(totalWishHours * hourlyWage));
  let wageProgressPercent = $derived(targetMid > 0 ? Math.min(100, Math.round((expectedMonthlyWage / targetMid) * 100)) : 0);

  // 曜日パターン適用
  async function applyStampToWeekday(dayOfWeek: number) {
    if (isLocked) {
      alert('締め切りを過ぎているか、ロックされているため変更できません。');
      return;
    }

    const stampId = activeTemplateStampId;
    const existingIndex = weeklyTemplates.findIndex(t => Number(t.dayOfWeek) === dayOfWeek);

    if (stampId === 'free') {
      if (existingIndex !== -1) {
        weeklyTemplates.splice(existingIndex, 1);
      }
    } else if (stampId === 'ng') {
      const newT: WeeklyTemplate = {
        dayOfWeek,
        type: 'ng',
        startTime: '',
        endTime: ''
      };
      if (existingIndex !== -1) {
        weeklyTemplates[existingIndex] = newT;
      } else {
        weeklyTemplates.push(newT);
      }
    } else if (stampId === 'fixed') {
      const newT: WeeklyTemplate = {
        dayOfWeek,
        type: 'specific',
        startTime: '09:45',
        endTime: '15:00'
      };
      if (existingIndex !== -1) {
        weeklyTemplates[existingIndex] = newT;
      } else {
        weeklyTemplates.push(newT);
      }
    } else if (stampId === 'custom') {
      const startStr = minutesToTimeStr(customStartMinutes);
      const endStr = minutesToTimeStr(customEndMinutes);
      const newT: WeeklyTemplate = {
        dayOfWeek,
        type: 'specific',
        startTime: startStr,
        endTime: endStr
      };
      if (existingIndex !== -1) {
        weeklyTemplates[existingIndex] = newT;
      } else {
        weeklyTemplates.push(newT);
      }
    }

    weeklyTemplates = [...weeklyTemplates];

    try {
      await saveWeeklyTemplates(userId, weeklyTemplates);
      console.log('[Firestore] Weekly templates synced successfully');
    } catch (e) {
      console.warn('Firestore save templates failed, but local UI is updated:', e);
    }
  }

  // 個別解除バイパスのトグル
  async function toggleUnlockBypass(checked: boolean) {
    try {
      const submittalDocId = `${userId}_${targetYear}_${String(targetMonth).padStart(2, '0')}`;
      const docRef = doc(db, 'submittals', submittalDocId);
      await setDoc(docRef, { isUnlocked: checked }, { merge: true });
      console.log('[Firestore] Individual unlock state saved successfully:', checked);
    } catch (e) {
      console.warn('Firestore individual unlock state save failed:', e);
    }
  }

  // カレンダー読込 (Offline-first)
  async function loadCalendar(forceFetchTemplates = false) {
    isLoading = false;

    const currentYear = targetYear;
    const currentMonth = targetMonth;
    const currentUserId = userId;

    const templatesPromise = forceFetchTemplates 
      ? getWeeklyTemplates(currentUserId).catch(() => weeklyTemplates)
      : Promise.resolve(weeklyTemplates);

    Promise.all([
      templatesPromise,
      getDoc(doc(db, 'submittals', `${currentUserId}_${currentYear}_${String(currentMonth).padStart(2, '0')}`))
        .then(snap => snap.exists() ? snap.data() : { isSubmitted: false, isUnlocked: false })
        .catch(() => ({ isSubmitted: false, isUnlocked: false })),
      getMonthlyConfirmedShifts(currentYear, currentMonth).catch((err) => {
        console.warn('Error fetching monthly confirmed shifts in background:', err);
        return [];
      })
    ]).then(async ([templates, submittalData, shifts]) => {
      if (targetYear === currentYear && targetMonth === currentMonth && userId === currentUserId) {
        if (templates) {
          weeklyTemplates = templates;
        }
        isSubmitted = submittalData.isSubmitted === true;
        userIsUnlocked = submittalData.isUnlocked === true;
        monthlyConfirmedShifts = shifts || [];

        const latestTemplates = templates || weeklyTemplates;

        // 最新のテンプレートを使って当月の wishes をフェッチして例外を抽出
        try {
          const dbWishes = await Promise.race([
            generateMonthlyWishes(currentUserId, currentYear, currentMonth, latestTemplates),
            new Promise<Wish[]>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 800))
          ]);
          if (targetYear === currentYear && targetMonth === currentMonth && userId === currentUserId) {
            const exceptionsMap: { [dateStr: string]: Wish } = {};
            dbWishes.forEach(w => {
              if (w.isOverridden) {
                exceptionsMap[w.date] = w;
              }
            });
            overriddenWishes = exceptionsMap;
          }
        } catch (err) {
          console.warn('Firestore load slow/failed, holding offline wishes:', err);
          if (targetYear === currentYear && targetMonth === currentMonth && userId === currentUserId) {
            overriddenWishes = {};
          }
        }
      }
    }).catch((err) => {
      console.warn('Offline-first background sync failed:', err);
    });
  }

  // 非常に柔軟でスマートな時間パース関数
  function parseCustomTime(val: string): { startTime: string; endTime: string } | null {
    const clean = val.replace(/\s+/g, '').replace(/[〜～~ー]/g, '-');
    
    // パターン1: HH:MM-HH:MM or H:MM-H:MM or H:M-H:M etc.
    const fullPattern = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;
    const m1 = clean.match(fullPattern);
    if (m1) {
      const sh = String(m1[1]).padStart(2, '0');
      const sm = String(m1[2]).padStart(2, '0');
      const eh = String(m1[3]).padStart(2, '0');
      const em = String(m1[4]).padStart(2, '0');
      return { startTime: `${sh}:${sm}`, endTime: `${eh}:${em}` };
    }

    // パターン2: HH-HH or H-H etc.
    const hourOnlyPattern = /^(\d{1,2})-(\d{1,2})$/;
    const m2 = clean.match(hourOnlyPattern);
    if (m2) {
      const sh = String(m2[1]).padStart(2, '0');
      const eh = String(m2[2]).padStart(2, '0');
      return { startTime: `${sh}:00`, endTime: `${eh}:00` };
    }

    // パターン3: H:MM-H or HH:MM-HH
    const startMinEndHourPattern = /^(\d{1,2}):(\d{2})-(\d{1,2})$/;
    const m3 = clean.match(startMinEndHourPattern);
    if (m3) {
      const sh = String(m3[1]).padStart(2, '0');
      const sm = String(m3[2]).padStart(2, '0');
      const eh = String(m3[3]).padStart(2, '0');
      return { startTime: `${sh}:${sm}`, endTime: `${eh}:00` };
    }

    // パターン4: H-H:MM or HH-HH:MM
    const startHourEndMinPattern = /^(\d{1,2})-(\d{1,2}):(\d{2})$/;
    const m4 = clean.match(startHourEndMinPattern);
    if (m4) {
      const sh = String(m4[1]).padStart(2, '0');
      const eh = String(m4[2]).padStart(2, '0');
      const em = String(m4[3]).padStart(2, '0');
      return { startTime: `${sh}:00`, endTime: `${eh}:${em}` };
    }

    // パターン5: 4桁-4桁 (例: 1000-1500)
    const fourDigitsPattern = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/;
    const m5 = clean.match(fourDigitsPattern);
    if (m5) {
      return { startTime: `${m5[1]}:${m5[2]}`, endTime: `${m5[3]}:${m5[4]}` };
    }

    return null;
  }

  // インライン直接タイピング入力開始
  function enterInlineEditing(dateStr: string, wish: Wish | undefined) {
    if (isLocked) return;
    editingDateStr = dateStr;
    if (wish && wish.type === 'specific' && wish.startTime && wish.endTime) {
      editingInputVal = `${wish.startTime}-${wish.endTime}`;
    } else {
      editingInputVal = '10:00-18:00';
    }
  }

  // インライン直接タイピング入力保存
  async function saveCustomTime(dateStr: string, day: number) {
    const parsed = parseCustomTime(editingInputVal);
    let finalType: 'specific' | 'free' | 'ng' = 'specific';
    let finalStart = '';
    let finalEnd = '';
    
    if (parsed) {
      finalType = 'specific';
      finalStart = parsed.startTime;
      finalEnd = parsed.endTime;
    } else {
      finalType = 'specific';
      finalStart = '10:00';
      finalEnd = '18:00';
    }

    // 曜日別テンプレート (Layer 1) を取得して比較
    const jsDate = new Date(targetYear, targetMonth - 1, day);
    const dayOfWeek = jsDate.getDay();
    const dayTemplates = weeklyTemplates.filter(t => Number(t.dayOfWeek) === dayOfWeek);

    let isOverridden = true;
    if (dayTemplates.length > 0) {
      const template = dayTemplates[0];
      if (template.type === finalType && template.startTime === finalStart && template.endTime === finalEnd) {
        isOverridden = false;
      }
    }

    const updatedWish: Wish = {
      date: dateStr,
      type: finalType,
      startTime: finalStart,
      endTime: finalEnd,
      isOverridden,
      isSubmitted: false
    };

    // 楽観的UI更新
    if (isOverridden) {
      overriddenWishes[dateStr] = updatedWish;
    } else {
      delete overriddenWishes[dateStr];
    }
    overriddenWishes = { ...overriddenWishes };

    // 編集ステートクリア
    editingDateStr = null;

    // バックグラウンドでFirestoreへ即時保存
    try {
      await saveWish(userId, updatedWish, weeklyTemplates);
    } catch (e) {
      console.warn('Firestore save custom wish failed:', e);
    }
  }

  // グローバルクリック（コンテキストメニュー閉じる用）
  function handleWindowClick() {
    activeMenuDate = null;
  }

  // スタンプIDを個別に適用する汎用処理
  async function applyStampById(dateStr: string, day: number, stampId: string) {
    if (isLocked) {
      alert('締め切りを過ぎているか、ロックされているため変更できません。');
      return;
    }

    const stamp = stamps.find(s => s.id === stampId);
    if (!stamp) return;

    // 曜日別テンプレート (Layer 1) を取得して比較
    const jsDate = new Date(targetYear, targetMonth - 1, day);
    const dayOfWeek = jsDate.getDay();
    const dayTemplates = weeklyTemplates.filter(t => Number(t.dayOfWeek) === dayOfWeek);

    let isOverridden = true;
    let finalType = stamp.type;
    let finalStart = stamp.startTime;
    let finalEnd = stamp.endTime;

    if (stamp.id === 'free') {
      if (dayTemplates.length > 0) {
        const template = dayTemplates[0];
        finalType = template.type;
        finalStart = template.startTime;
        finalEnd = template.endTime;
        isOverridden = false;
      } else {
        isOverridden = false;
      }
    } else {
      if (dayTemplates.length > 0) {
        const template = dayTemplates[0];
        if (stamp.type === template.type && stamp.startTime === template.startTime && stamp.endTime === template.endTime) {
          isOverridden = false;
        }
      }
    }

    const updatedWish: Wish = {
      date: dateStr,
      type: finalType,
      startTime: finalStart,
      endTime: finalEnd,
      isOverridden,
      isSubmitted: false
    };

    // 楽観的UI更新
    if (isOverridden) {
      overriddenWishes[dateStr] = updatedWish;
    } else {
      delete overriddenWishes[dateStr];
    }
    overriddenWishes = { ...overriddenWishes };

    // バックグラウンドでFirestoreへ即時保存
    try {
      await saveWish(userId, updatedWish, weeklyTemplates);
    } catch (e) {
      console.warn('Firestore save wish failed, but local UI is preserved:', e);
    }
  }

  // カレンダーセルがクリックされた際のスタンプ適用
  async function applyStampToCell(dateStr: string, day: number) {
    if (isLocked) {
      alert('締め切りを過ぎているか、ロックされているため変更できません。');
      return;
    }
    if (selectedStampId === 'custom') {
      const wish = wishes.find(w => w.date === dateStr);
      enterInlineEditing(dateStr, wish);
      return;
    }
    await applyStampById(dateStr, day, selectedStampId);
  }

  // 提出処理
  let isSavedToast = $state(false);
  let isSyncingWishesNotion = $state(false);

  async function submitWishes() {
    isSubmitted = true;
    isSavedToast = true;
    
    setTimeout(() => {
      isSavedToast = false;
    }, 3000);

    try {
      await submitMonthlyWishes(userId, targetYear, targetMonth, wishes);

      // ユーザーの target_monthly_income および isLateSubmission を Firestore に保存・更新する
      const userRef = doc(db, 'users', userId);
      const isLate = isDeadlinePassed;
      await setDoc(userRef, {
        target_monthly_income: targetMonthlyIncomeInput,
        targetIncomeMax: targetMonthlyIncomeInput, // 互換性のため
        isLateSubmission: isLate
      }, { merge: true });

      // ローカルの staffs 配列内の当該スタッフのデータも更新する
      const idx = staffs.findIndex(s => s.id === userId);
      if (idx !== -1) {
        staffs[idx].target_monthly_income = targetMonthlyIncomeInput;
        staffs[idx].targetIncomeMax = targetMonthlyIncomeInput;
        staffs[idx].isLateSubmission = isLate;
      }

      console.log('[Firestore] Wishes and target monthly income submitted successfully');
      await loadCalendar(false);
    } catch (e) {
      console.warn('[Firestore] Wishes submission failed:', e);
    }

    // Notion 同期 (バックグラウンド)
    isSyncingWishesNotion = true;
    backupWishesToNotion(userId, targetYear, targetMonth, wishes)
      .then((res) => {
        isSyncingWishesNotion = false;
        if (res) {
          console.log('[Notion Backup] Automatically synced wishes to Notion in background.');
        }
      })
      .catch((e) => {
        isSyncingWishesNotion = false;
        console.warn('[Notion Backup] Background sync failed/offline:', e);
      });
  }

  // 初期ロード
  onMount(() => {
    (async () => {
      try {
        const loadedStaffs = await getStaffDetails(staffs);
        if (loadedStaffs && loadedStaffs.length > 0) {
          staffs = loadedStaffs;
        }
      } catch (e) {
        console.warn('Failed to load staff details from DB, using fallback:', e);
      }
    })();

    // 1日午前0時のスライドを検知するタイマー（毎分チェック）
    const interval = setInterval(() => {
      const newNow = new Date();
      if (newNow.getDate() !== today.getDate() || newNow.getMonth() !== today.getMonth()) {
        today = newNow;
      }
    }, 60000);

    return () => clearInterval(interval);
  });
</script>
<svelte:window onclick={handleWindowClick} />

<div class="min-h-screen bg-slate-50 text-slate-800 pb-32 font-sans transition-colors duration-300 ease-in-out">
  <div class="max-w-4xl mx-auto px-4 py-8 space-y-8">
    
    <!-- 上部: ヘッダー & ユーザー制御 -->
    <header class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-slate-200">
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
          <span>IPO Shift - シフト希望提出</span>
        </h1>
        <p class="text-xs text-slate-500">シンプルでクリーンなモダン希望提出システム</p>
      </div>

      <!-- デモユーザー＆ロック制御シミュレーター -->
      {#if authState.user?.isAdmin}
        <div class="flex items-center gap-3 bg-white px-4 py-2 rounded-full border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-1.5 border-r border-slate-100 pr-3">
            <label for="demo-user-id" class="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">User:</label>
            <input 
              id="demo-user-id"
              type="text" 
              bind:value={userId} 
              onchange={() => loadCalendar(true)}
              class="bg-slate-50 border border-slate-200 rounded-full px-3 py-1 text-xs text-slate-800 w-28 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300" 
            />
          </div>

          <!-- ロックシミュレータートグル -->
          <div class="flex items-center gap-2">
            <label for="simulate-lock" class="text-[10px] text-slate-500 font-semibold cursor-pointer">手動ロック</label>
            <input 
              id="simulate-lock"
              type="checkbox" 
              bind:checked={isSystemLocked} 
              class="w-3.5 h-3.5 text-slate-800 rounded bg-slate-100 border-slate-300 focus:ring-slate-400 focus:ring-offset-0"
            />
          </div>
        </div>
      {/if}
    </header>

    <!-- タブ切り替えナビゲーション (Instagram風クリーンモダンカプセル) -->
    <nav class="flex justify-center p-1 bg-slate-100 rounded-2xl border border-slate-200/60 max-w-md mx-auto shadow-sm">
      <button 
        type="button"
        onclick={() => activeTab = 'shifts'}
        class="flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5
          {activeTab === 'shifts' 
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' 
            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'}"
      >
        <span>📋</span>
        <span>みんなのシフト</span>
      </button>
      <button 
        type="button"
        onclick={() => { activeTab = 'wishes'; loadCalendar(false); }}
        class="flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5
          {activeTab === 'wishes' 
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' 
            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'}"
      >
        <span>📅</span>
        <span>希望提出</span>
      </button>
      <button 
        type="button"
        onclick={() => activeTab = 'templates'}
        class="flex-1 py-2 px-3 text-xs font-bold rounded-xl transition-all duration-300 flex items-center justify-center gap-1.5
          {activeTab === 'templates' 
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' 
            : 'text-slate-500 hover:text-slate-800 hover:bg-white/50'}"
      >
        <span>⚙️</span>
        <span>固定設定</span>
      </button>
    </nav>

    <!-- メインコンテンツ -->
    <main class="space-y-6">
      <!-- 【タブ0: みんなのシフト (閲覧専用)】 -->
      {#if activeTab === 'shifts'}
        <section class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-6 animate-in fade-in duration-300">
          
          <!-- 前後半ステータスバッジ (画面上部) -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col justify-between transition duration-300">
              <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">前半（1日〜15日）</span>
              <div class="flex justify-between items-center mt-1.5">
                <span class="text-xs font-bold text-slate-800">{targetMonth}月前半</span>
                <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 border border-emerald-100 text-emerald-600">
                  確定済み ✅
                </span>
              </div>
            </div>
            <div class="bg-slate-50 border border-slate-200/60 rounded-2xl p-3 flex flex-col justify-between transition duration-300">
              <span class="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">後半（16日〜末日）</span>
              <div class="flex justify-between items-center mt-1.5">
                <span class="text-xs font-bold text-slate-800">{targetMonth}月後半</span>
                <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-amber-50 border border-amber-100 text-amber-600">
                  調整中 ⏳
                </span>
              </div>
            </div>
          </div>

          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 class="text-lg font-bold text-slate-800 tracking-tight">
                {showAllShifts ? '店舗全体シフト表（確定分）' : 'あなたのシフト表（確定分）'}
              </h2>
              <p class="text-xs text-slate-400 mt-0.5 font-medium">
                {showAllShifts 
                  ? '確定されたメンバーの出勤状況を月間カレンダーでひと目で確認できます。' 
                  : 'あなたが今月出勤する日と時間を確認できます。'}
              </p>
            </div>
            
            <div class="flex items-center gap-3 flex-wrap w-full sm:w-auto justify-between sm:justify-end">
              <!-- 自分のみ・全員の切り替えコントロール -->
              <div class="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-full border border-slate-200/60 shadow-sm text-xs">
                <button 
                  type="button"
                  onclick={() => showAllShifts = false}
                  class="px-3 py-1.5 rounded-full font-bold transition-all duration-300 flex items-center gap-1
                    {!showAllShifts 
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'}"
                >
                  <span>👤</span>
                  <span>自分のみ</span>
                </button>
                <button 
                  type="button"
                  onclick={() => showAllShifts = true}
                  class="px-3 py-1.5 rounded-full font-bold transition-all duration-300 flex items-center gap-1
                    {showAllShifts 
                      ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' 
                      : 'text-slate-500 hover:text-slate-800'}"
                >
                  <span>👥</span>
                  <span>全員分</span>
                </button>
              </div>

              <!-- 提出対象年月表示 -->
              <div class="bg-indigo-50 border border-indigo-100 rounded-full px-3.5 py-1 text-indigo-700 font-extrabold text-[11px] tracking-wider font-mono">
                {targetYear}年{targetMonth}月度
              </div>
            </div>
          </div>

          <!-- カレンダーグリッド -->
          <!-- 曜日見出し -->
          <div class="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2">
            {#each dayNames as name, i}
              <span class="{i === 0 ? 'text-rose-450 font-extrabold' : i === 6 ? 'text-blue-500 font-extrabold' : ''}">{name}</span>
            {/each}
          </div>

          <!-- カレンダーセル -->
          <div class="grid grid-cols-7 gap-1 sm:gap-2">
            {#each shiftCalendarCells as cell}
              {#if cell.isEmpty}
                <div class="bg-slate-50/10 border border-transparent rounded-2xl aspect-[4/3] sm:aspect-square"></div>
              {:else}
                {@const dailyShift = cell.dailyShift}
                {@const isSunday = parseLocalDate(cell.dateStr).getDay() === 0}
                {@const isSaturday = parseLocalDate(cell.dateStr).getDay() === 6}
                {@const workingStaff = getStaffWorkingHoursForDay(dailyShift, staffs)}
                {@const hasMe = isMyShift(dailyShift, userId)}
                
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div 
                  role="button"
                  tabindex="0"
                  onclick={() => onShiftCellClick(cell)}
                  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onShiftCellClick(cell)}
                  class="border rounded-2xl min-h-[110px] sm:min-h-[140px] p-2 flex flex-col justify-between transition-all duration-300 ease-in-out relative group shadow-sm overflow-hidden cursor-pointer hover:border-slate-450 hover:shadow-md hover:scale-[1.02]
                    {hasMe 
                      ? 'border-indigo-300 bg-indigo-50/40 text-indigo-900 shadow-[0_0_15px_rgba(99,102,241,0.18)] ring-2 ring-indigo-200/50' 
                      : 'border-slate-200/80 bg-white text-slate-500'}"
                >
                  <!-- 上部: 日付 -->
                  <div class="flex justify-between items-center w-full">
                    <span class="text-xs font-bold 
                      {isSunday ? 'text-rose-500' : isSaturday ? 'text-blue-500' : 'text-slate-800'}
                    ">
                      {cell.day}
                    </span>
                    {#if hasMe}
                      <span class="text-[8px] font-extrabold px-1.5 py-0.5 rounded-full bg-indigo-600 text-white animate-pulse shadow-sm flex items-center justify-center gap-0.5">
                        <span>✨</span>
                        <span>出勤</span>
                      </span>
                    {/if}
                  </div>

                  <!-- 中心部: その日に出勤する全スタッフの名前と時間をコンパクトに表示 -->
                  <div class="flex-grow flex flex-col gap-1 mt-1.5 max-h-[72px] sm:max-h-[100px] overflow-y-auto pr-0.5 scrollbar-none select-none">
                    {#if !showAllShifts}
                      {@const myAssign = workingStaff.find(assign => assign.staffId === userId)}
                      {#if myAssign}
                        <div class="px-1.5 py-2.5 rounded-2xl text-[9px] sm:text-[10px] font-extrabold border bg-indigo-600 border-indigo-700 text-white shadow-[0_2px_8px_rgba(99,102,241,0.25)] ring-1 ring-indigo-400 flex flex-col items-center justify-center gap-1 h-full min-h-[50px] animate-in fade-in zoom-in-95 duration-200">
                          <span class="text-[8px] opacity-90 uppercase tracking-widest">出勤時間</span>
                          <span class="font-mono bg-indigo-800/40 px-2 py-0.5 rounded-full text-xs font-bold">{myAssign.timeRangeStr}</span>
                        </div>
                      {:else}
                        <div class="h-full flex items-center justify-center py-4 text-[9px] text-slate-355 italic font-semibold">
                          お休み ☕
                        </div>
                      {/if}
                    {:else}
                      {#if workingStaff.length === 0}
                        <div class="h-full flex items-center justify-center py-2 text-[9px] text-slate-355 italic font-medium">
                          休み ☕
                        </div>
                      {:else}
                        {#each workingStaff.slice(0, 3) as assign}
                          {@const isSelf = assign.staffId === userId}
                          <div 
                            class="px-1.5 py-0.5 rounded text-[8px] sm:text-[9px] font-bold border truncate tracking-tight transition duration-300
                              {isSelf 
                                ? 'bg-indigo-600 border-indigo-700 text-white shadow-sm ring-1 ring-indigo-400' 
                                : 'bg-slate-50 border-slate-200/80 text-slate-700'}"
                          >
                            {#if assign.role === 'employee'}[社員]{:else if assign.role === 'adult'}[成人]{:else}[未成]{/if} {assign.staffName.split(' ')[0]} <span class="font-mono opacity-90">({assign.timeRangeStr})</span>
                          </div>
                        {/each}
                        {#if workingStaff.length > 3}
                          <div class="text-[8px] sm:text-[9px] font-extrabold text-slate-400 text-center py-0.5">
                            他 {workingStaff.length - 3} 名...
                          </div>
                        {/if}
                      {/if}
                    {/if}
                  </div>
                </div>
              {/if}
            {/each}
          </div>
          
          <!-- 凡例 -->
          <div class="flex items-center flex-wrap gap-4 text-[10px] pt-4 text-slate-400 font-medium font-sans border-t border-slate-100">
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded-lg bg-indigo-600 inline-block shadow-sm ring-2 ring-indigo-200/50"></span>
              <span class="text-slate-700 font-bold">自分のシフト（グロウ強調）</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded-lg bg-slate-50 border border-slate-200 inline-block"></span>
              <span class="text-slate-600">他のメンバーの出勤</span>
            </div>
            <div class="flex items-center gap-1.5">
              <span class="w-3.5 h-3.5 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-[8px] italic text-slate-350">☕</span>
              <span class="text-slate-400">全員お休み / 休館日</span>
            </div>
          </div>

        </section>
      {/if}

      <!-- 【タブ1: シフト希望提出】 -->
      {#if activeTab === 'wishes'}
        <section class="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-6 animate-in fade-in duration-300">
          
          <!-- カレンダーヘッダー・月選択 -->
          <div class="flex justify-between items-center flex-wrap gap-4 pb-4 border-b border-slate-100">
            <div class="flex items-center space-x-3">
              <h2 class="text-lg font-bold text-slate-800 tracking-tight">希望カレンダー</h2>
              <!-- 提出対象年月表示 -->
              <div class="bg-indigo-50 border border-indigo-100 rounded-full px-3.5 py-1 text-indigo-700 font-extrabold text-[11px] tracking-wider font-mono">
                {targetYear}年{targetMonth}月度
              </div>
            </div>

            <!-- 自動締め切り設定表示（25日締め自動化） -->
            <div class="text-[10px] bg-slate-50 px-4 py-2 rounded-full border border-slate-200/60 flex items-center gap-3 text-slate-500 font-sans">
              <span class="font-bold text-slate-400 uppercase tracking-wider">締切日時:</span>
              <span class="font-bold text-slate-700 font-mono">{deadlineYear}/{String(deadlineMonth).padStart(2, '0')}/25 23:59</span>
              
              <!-- 個別解除バイパストグル -->
              <div class="flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <label for="override-lock" class="text-amber-600 font-bold">個別解除</label>
                <input 
                  id="override-lock"
                  type="checkbox" 
                  bind:checked={userIsUnlocked} 
                  onchange={() => toggleUnlockBypass(userIsUnlocked)}
                  class="w-3.5 h-3.5 text-amber-500 rounded bg-white border-slate-350 focus:ring-amber-400"
                />
              </div>
            </div>
          </div>

          <!-- 【目標希望月収の設定】 (プレミアムカード・リアルタイムシミュレーター同期) -->
          <div class="bg-gradient-to-r from-indigo-50/60 to-teal-50/30 border border-indigo-100/70 p-5 rounded-3xl space-y-4 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div class="space-y-1">
              <h3 class="text-sm font-extrabold text-slate-800 flex items-center gap-1.5">
                <span>🎯</span>
                <span>目標希望月収の設定</span>
              </h3>
              <p class="text-[10px] text-slate-500 font-medium">今月のシフト配置における目標希望金額を ¥5,000 単位で設定してください。</p>
            </div>
            
            <div class="flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-slate-200/80 rounded-2xl px-4 py-2 shadow-xs min-w-[180px] justify-between self-start sm:self-auto hover:border-slate-300 transition-colors">
              <span class="text-xs text-slate-400 font-extrabold">¥</span>
              <input 
                type="number" 
                bind:value={targetMonthlyIncomeInput}
                min="0"
                step="5000"
                class="w-28 bg-transparent text-right text-sm font-extrabold text-slate-800 focus:outline-none"
                placeholder="例: 45,000"
                aria-label="目標希望月収"
              />
              <span class="text-[10px] text-slate-500 font-bold ml-1">円</span>
            </div>
          </div>

          <!-- 提出締切ステータスバナー (極めて分かりやすいプレミアム仕様) -->
          <div class="p-4 rounded-2xl border transition-all duration-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs
            {isDeadlinePassed
              ? 'bg-amber-50/75 border-amber-100 text-amber-800 animate-pulse'
              : isLocked 
                ? 'bg-rose-50/75 border-rose-100 text-rose-800' 
                : userIsUnlocked 
                  ? 'bg-amber-50/75 border-amber-100 text-amber-800 animate-pulse' 
                  : 'bg-emerald-50/75 border-emerald-100 text-emerald-800'}"
          >
            <div class="flex items-center gap-3">
              <span class="text-xl">
                {#if isDeadlinePassed}⚠️{:else if isLocked}🔒{:else if userIsUnlocked}🔓{:else}⏰{/if}
              </span>
              <div>
                <p class="text-xs font-extrabold flex flex-wrap items-center gap-1.5">
                  <span>希望提出締め切り日時:</span>
                  <span class="font-mono bg-white/90 border px-3 py-0.5 rounded-full shadow-xs text-xs
                    {isDeadlinePassed ? 'border-amber-200 text-amber-600 font-extrabold' : isLocked ? 'border-rose-200 text-rose-600' : userIsUnlocked ? 'border-amber-200 text-amber-600 font-extrabold' : 'border-emerald-200 text-emerald-600'}">
                    {deadlineDate ? deadlineDate.replace(/-/g, '/') : ''} {deadlineTime || '23:59'}
                  </span>
                </p>
                <p class="text-[9px] font-bold mt-1 opacity-90">
                  {#if isDeadlinePassed}
                    ※締め切り日時を経過しています。変更内容は【修正要望（遅延提出）】として再提出可能です。
                  {:else if isLocked}
                    ※提出済みまたはシステムロック中のため、希望のスタンプ・直接入力および提出は【完全ロック】されています。
                  {:else if userIsUnlocked}
                    ※個別解除（救済解除）が有効なため、例外的に編集・再提出が可能です！
                  {:else}
                    ※締め切り前です。スタンプ入力やコンテキストメニュー、ダブルクリック編集にて自由に希望を設定して提出してください。
                  {/if}
                </p>
              </div>
            </div>

            <!-- ステータスラベル -->
            <span class="self-start sm:self-center px-4.5 py-1.5 rounded-full text-[10px] font-extrabold tracking-wider shadow-xs uppercase text-center
              {isDeadlinePassed
                ? 'bg-amber-500 text-white'
                : isLocked 
                  ? 'bg-rose-500 text-white animate-pulse' 
                  : userIsUnlocked 
                    ? 'bg-amber-500 text-white font-extrabold' 
                    : 'bg-emerald-500 text-white'}"
            >
              {#if isDeadlinePassed}
                修正要望 受付中 ⚠️
              {:else if isLocked}
                編集ロック中 🔒
              {:else if userIsUnlocked}
                個別解除 (編集可) 🔓
              {:else}
                希望提出受付中 🚀
              {/if}
            </span>
          </div>

          <!-- 常駐スタンプパレット (カレンダー上部に常駐する丸みのあるトレイ) -->
          <div class="bg-slate-50 border border-slate-200/60 p-4 rounded-3xl space-y-3 shadow-sm select-none">
            <div class="flex justify-between items-center">
              <span class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <span>🎨</span>
                <span>時間スタンプパレット</span>
              </span>
              <span class="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-2.5 py-0.5 rounded-full font-extrabold uppercase tracking-wider">
                タップするだけで直感入力！
              </span>
            </div>
            
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {#each stamps as stamp}
                <button
                  type="button"
                  onclick={() => selectedStampId = stamp.id}
                  disabled={isLocked}
                  class="px-4 py-3 rounded-2xl border-2 transition-all duration-300 font-sans font-bold text-xs flex items-center justify-center gap-2 shadow-sm
                    {isLocked 
                      ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-100/50 text-slate-400' 
                      : 'cursor-pointer hover:scale-[1.02] active:scale-95'}
                    {selectedStampId === stamp.id && !isLocked
                      ? 'bg-slate-900 border-slate-900 text-white ring-4 ring-slate-200/50 shadow-md' 
                      : `${stamp.colorClass} border-slate-200/80 hover:border-slate-400`}"
                >
                  <span class="text-sm">{stamp.icon}</span>
                  <span>{stamp.label}</span>
                </button>
              {/each}
            </div>
            
            <p class="text-[10px] text-slate-400 font-medium text-center">
              ※スタンプを選択し、下のカレンダーの日付マスをタップすると、その内容で一瞬で上書き保存されます。
            </p>
          </div>

          <!-- カレンダーグリッド -->
          {#if isLoading}
            <div class="flex justify-center items-center py-32">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
            </div>
          {:else}
            <!-- 曜日見出し -->
            <div class="grid grid-cols-7 gap-1 sm:gap-2 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pb-2">
              {#each dayNames as name, i}
                <span class="{i === 0 ? 'text-rose-400' : i === 6 ? 'text-blue-400' : ''}">{name}</span>
              {/each}
            </div>

            <!-- カレンダーセル -->
            <div class="grid grid-cols-7 gap-1 sm:gap-2">
              {#each calendarCells as cell}
                {#if cell.isEmpty}
                  <div class="bg-slate-50/10 border border-transparent rounded-2xl aspect-square"></div>
                {:else}
                  {@const wish = cell.wish}
                  {@const isSunday = parseLocalDate(cell.dateStr).getDay() === 0}
                  {@const isSaturday = parseLocalDate(cell.dateStr).getDay() === 6}
                  
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div 
                    role="button"
                    tabindex="0"
                    onclick={(e) => {
                      e.stopPropagation();
                      activeMenuDate = null;
                      applyStampToCell(cell.dateStr, cell.day);
                    }}
                    ondblclick={(e) => {
                      e.stopPropagation();
                      enterInlineEditing(cell.dateStr, wish);
                    }}
                    oncontextmenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      activeMenuDate = cell.dateStr;
                    }}
                    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && applyStampToCell(cell.dateStr, cell.day)}
                    class="border rounded-2xl aspect-square p-2 flex flex-col justify-between transition-all duration-300 ease-in-out relative group shadow-sm select-none
                      {activeMenuDate === cell.dateStr ? 'overflow-visible z-30 ring-2 ring-indigo-400 border-indigo-400' : 'overflow-hidden z-10'}
                      {isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-slate-400 hover:shadow-md hover:scale-[1.03] active:scale-95'}
                      {wish?.isOverridden 
                        ? 'border-amber-300 bg-amber-50/60 text-amber-700 ring-2 ring-amber-200/50 shadow-sm' 
                        : wish?.type === 'specific'
                          ? 'border-blue-100 bg-blue-50/70 text-blue-700'
                          : wish?.type === 'ng'
                            ? 'border-red-100 bg-red-50/70 text-red-700'
                            : 'border-slate-200/80 bg-slate-50 text-slate-500'}
                    "
                  >
                    <!-- 上部: 日付 -->
                    <div class="flex justify-between items-center w-full">
                      <span class="text-xs font-bold 
                        {isSunday ? 'text-rose-400' : isSaturday ? 'text-blue-400' : 'text-slate-700'}
                      ">
                        {cell.day}
                      </span>
                      {#if wish?.isOverridden}
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 ring-2 ring-amber-100" title="個別修正あり"></span>
                      {/if}
                    </div>

                    <!-- 中心部: クリーンなバッジUI ＆ インライン直接入力フィールド -->
                    <div class="flex flex-col items-center justify-center flex-grow py-1 w-full">
                      {#if editingDateStr === cell.dateStr}
                        <!-- svelte-ignore a11y_autofocus -->
                        <input 
                          type="text" 
                          autofocus 
                          bind:value={editingInputVal}
                          onkeydown={(e) => {
                            e.stopPropagation();
                            if (e.key === 'Enter') {
                              saveCustomTime(cell.dateStr, cell.day);
                            } else if (e.key === 'Escape') {
                              editingDateStr = null;
                            }
                          }}
                          onblur={() => saveCustomTime(cell.dateStr, cell.day)}
                          onclick={(e) => e.stopPropagation()}
                          class="w-full text-center py-1 px-1 bg-white border border-slate-350 rounded-xl text-[9px] font-bold font-mono focus:outline-none focus:ring-2 focus:ring-indigo-400 text-slate-800 transition"
                        />
                      {:else}
                        {#if wish?.type === 'specific'}
                          <div class="w-full flex justify-center">
                            <span class="text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full flex items-center justify-center gap-1 shadow-sm border border-blue-100/50 bg-blue-50 text-blue-600" title="特定時間">
                              <span>⏰</span>
                              <span class="font-mono">{wish.startTime}〜{wish.endTime}</span>
                            </span>
                          </div>
                        {:else if wish?.type === 'ng'}
                          <div class="w-full flex justify-center">
                            <span class="text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full flex items-center justify-center gap-1 shadow-sm border border-rose-100/50 bg-rose-50 text-rose-655" title="NG">
                              <span>❌</span>
                              <span>NG</span>
                            </span>
                          </div>
                        {:else}
                          <div class="w-full flex justify-center">
                            <span class="text-[9px] sm:text-[10px] font-bold px-2 py-1 rounded-full flex items-center justify-center gap-1 shadow-sm border border-slate-200/60 bg-white text-slate-500" title="おまかせ">
                              <span>✅</span>
                              <span>おまかせ</span>
                            </span>
                          </div>
                        {/if}
                      {/if}
                    </div>

                    <!-- 右下のアクションメニュートリガー -->
                    {#if !isLocked}
                      <button 
                        type="button" 
                        onclick={(e) => { e.stopPropagation(); activeMenuDate = cell.dateStr; }}
                        class="absolute bottom-1 right-1 w-4.5 h-4.5 rounded-full bg-slate-100/90 hover:bg-slate-200 border border-slate-200/65 flex items-center justify-center text-[9px] text-slate-500 hover:text-slate-700 shadow-sm opacity-60 sm:opacity-0 group-hover:opacity-100 focus:opacity-100 transition duration-200"
                        title="メニューを開く"
                      >
                        ⋮
                      </button>
                    {/if}

                    <!-- スマートコンテキストメニュー -->
                    {#if activeMenuDate === cell.dateStr && !isLocked}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div 
                        onclick={(e) => e.stopPropagation()}
                        class="absolute bottom-6 right-1 bg-white border border-slate-200 rounded-2xl shadow-xl py-1.5 min-w-[130px] z-50 animate-in fade-in zoom-in-95 duration-150 text-left flex flex-col"
                      >
                        <button 
                          type="button" 
                          onclick={(e) => { e.stopPropagation(); applyStampById(cell.dateStr, cell.day, 'free'); activeMenuDate = null; }}
                          class="w-full px-3 py-1 text-[9px] font-bold text-slate-750 hover:bg-slate-50 flex items-center gap-1.5 transition"
                        >
                          <span class="text-xs">✅</span>
                          <span>おまかせに切り替え</span>
                        </button>
                        <button 
                          type="button" 
                          onclick={(e) => { e.stopPropagation(); applyStampById(cell.dateStr, cell.day, 'ng'); activeMenuDate = null; }}
                          class="w-full px-3 py-1 text-[9px] font-bold text-slate-750 hover:bg-slate-50 flex items-center gap-1.5 transition"
                        >
                          <span class="text-xs">❌</span>
                          <span>NGに切り替え</span>
                        </button>
                        <button 
                          type="button" 
                          onclick={(e) => { e.stopPropagation(); applyStampById(cell.dateStr, cell.day, 'fixed1'); activeMenuDate = null; }}
                          class="w-full px-3 py-1 text-[9px] font-bold text-slate-750 hover:bg-slate-50 flex items-center gap-1.5 transition"
                        >
                          <span class="text-xs">🌅</span>
                          <span>固定枠1に切り替え</span>
                        </button>
                        <button 
                          type="button" 
                          onclick={(e) => { e.stopPropagation(); applyStampById(cell.dateStr, cell.day, 'fixed2'); activeMenuDate = null; }}
                          class="w-full px-3 py-1 text-[9px] font-bold text-slate-750 hover:bg-slate-50 flex items-center gap-1.5 transition"
                        >
                          <span class="text-xs">🌇</span>
                          <span>固定枠2に切り替え</span>
                        </button>
                        <div class="h-[1px] bg-slate-100 my-1"></div>
                        <button 
                          type="button" 
                          onclick={(e) => { e.stopPropagation(); enterInlineEditing(cell.dateStr, wish); activeMenuDate = null; }}
                          class="w-full px-3 py-1 text-[9px] font-bold text-indigo-650 hover:bg-indigo-50/50 flex items-center gap-1.5 transition"
                        >
                          <span class="text-xs">📝</span>
                          <span>カスタム時間を設定...</span>
                        </button>
                      </div>
                    {/if}
                  </div>
                {/if}
              {/each}
            </div>
          {/if}
        </section>
      {/if}

      <!-- 【タブ2: 曜日別テンプレート設定】 -->
      {#if activeTab === 'templates'}
        <div class="space-y-6 animate-in fade-in duration-300">
          
          <!-- 上部: 曜日パターン（スタンプ）パレット -->
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-5">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-slate-100">
              <div>
                <h2 class="text-base font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                  <span>🎨</span>
                  <span>曜日基本パターンパレット</span>
                </h2>
                <p class="text-[10px] text-slate-400 mt-0.5">曜日カードに適用したいパターンを選択してアクティブにしてください。</p>
              </div>
              <span class="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-600 px-3 py-1 rounded-full font-extrabold uppercase tracking-wider shadow-sm">
                パターンを選んで、下の曜日カードを1タップ！
              </span>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 select-none">
              {#each templateStamps as stamp}
                <button
                  type="button"
                  onclick={() => activeTemplateStampId = stamp.id}
                  disabled={isLocked}
                  class="px-4 py-4 rounded-2xl border-2 transition-all duration-300 font-sans font-bold text-xs flex flex-col items-center justify-center gap-2 shadow-sm text-center
                    {isLocked 
                      ? 'opacity-50 cursor-not-allowed border-slate-200 bg-slate-100/50 text-slate-400' 
                      : 'cursor-pointer hover:scale-[1.02] active:scale-95'}
                    {activeTemplateStampId === stamp.id && !isLocked
                      ? 'bg-slate-900 border-slate-900 text-white ring-4 ring-slate-200/50 shadow-md scale-[1.01]' 
                      : `${stamp.colorClass} border-slate-200/85 hover:border-slate-400`}"
                >
                  <span class="text-xl">{stamp.icon}</span>
                  <span class="font-extrabold text-slate-800 {activeTemplateStampId === stamp.id && !isLocked ? 'text-white' : ''}">{stamp.label}</span>
                  {#if stamp.id === 'custom'}
                    <span class="text-[9px] font-mono mt-0.5 opacity-90 px-2 py-0.5 rounded-full border {activeTemplateStampId === stamp.id && !isLocked ? 'bg-slate-800 border-slate-700 text-amber-300' : 'bg-white border-amber-200/50 text-amber-600'}">
                      {minutesToTimeStr(customStartMinutes)}〜{minutesToTimeStr(customEndMinutes)}
                    </span>
                  {/if}
                </button>
              {/each}
            </div>

            <!-- 時間帯スライダー (カスタム時間アクティブ時のみ滑らかに表示) -->
            {#if activeTemplateStampId === 'custom'}
              <div class="bg-amber-50/50 border border-amber-200/60 p-5 rounded-3xl space-y-4 animate-in slide-in-from-top-2 duration-300 select-none">
                <div class="flex justify-between items-center text-xs font-bold text-amber-850">
                  <span class="flex items-center gap-1.5">
                    <span>⏰</span>
                    <span>タイムレンジスライダー（15分単位）</span>
                  </span>
                  <span>
                    設定範囲: <span class="font-mono text-sm bg-white border border-amber-300 px-3 py-1 rounded-full text-amber-700 shadow-sm">{minutesToTimeStr(customStartMinutes)} 〜 {minutesToTimeStr(customEndMinutes)}</span>
                  </span>
                </div>

                <div class="space-y-4 pt-2">
                  <!-- 開始時間スライダー -->
                  <div class="space-y-1">
                    <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                      <span>開始時間: <span class="font-mono text-amber-600 font-bold">{minutesToTimeStr(customStartMinutes)}</span></span>
                      <span>最小: 09:45</span>
                    </div>
                    <input 
                      type="range" 
                      min="585" 
                      max="1200" 
                      step="15" 
                      bind:value={customStartMinutes}
                      disabled={isLocked}
                      class="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>

                  <!-- 終了時間スライダー -->
                  <div class="space-y-1">
                    <div class="flex justify-between text-[10px] text-slate-400 font-bold">
                      <span>終了時間: <span class="font-mono text-amber-600 font-bold">{minutesToTimeStr(customEndMinutes)}</span></span>
                      <span>最大: 20:15</span>
                    </div>
                    <input 
                      type="range" 
                      min="600" 
                      max="1215" 
                      step="15" 
                      bind:value={customEndMinutes}
                      disabled={isLocked}
                      class="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-amber-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                  </div>
                </div>

                <p class="text-[9px] text-amber-600/80 font-bold text-center">
                  ※スライダーを左右にドラッグして時間を15分単位でヌルヌル変更できます。開始時間が終了時間を超えないように自動調整されます。
                </p>
              </div>
            {/if}
          </section>

          <!-- 下部: 曜日別カレンダーカード -->
          <section class="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.015)] space-y-4">
            <div class="pb-2 border-b border-slate-100 flex justify-between items-center">
              <div>
                <h2 class="text-base font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
                  <span>📅</span>
                  <span>曜日別基本スケジュールカード</span>
                </h2>
                <p class="text-[10px] text-slate-400 mt-0.5">曜日カードをクリックして、選択中のパターンを1タップ割り当てします。</p>
              </div>
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-7 gap-3 select-none">
              {#each Array(7) as _, index}
                {@const dayOfWeekNum = (index + 1) % 7} <!-- 月=1, 火=2, ... 土=6, 日=0 -->
                {@const dayName = dayNames[dayOfWeekNum]}
                {@const currentTemplate = weeklyTemplates.find(t => Number(t.dayOfWeek) === dayOfWeekNum)}
                {@const isNg = currentTemplate?.type === 'ng'}
                {@const isSpecific = currentTemplate?.type === 'specific'}
                {@const isFixed = isSpecific && currentTemplate?.startTime === '09:45' && currentTemplate?.endTime === '15:00'}
                {@const isCustom = isSpecific && !isFixed}
                {@const isFree = !currentTemplate}
                
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  role="button"
                  tabindex="0"
                  onclick={() => !isLocked && applyStampToWeekday(dayOfWeekNum)}
                  onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && !isLocked && applyStampToWeekday(dayOfWeekNum)}
                  class="border rounded-2xl p-4 min-h-[150px] flex flex-col justify-between transition-all duration-300 ease-in-out text-center
                    {isLocked 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'cursor-pointer hover:shadow-md hover:scale-[1.03] active:scale-95'}
                    {isFree 
                      ? 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-450' 
                      : isNg 
                        ? 'border-rose-300 bg-rose-50/60 text-rose-700 shadow-sm hover:border-rose-400' 
                        : isFixed 
                          ? 'border-sky-300 bg-sky-50/60 text-sky-700 shadow-sm hover:border-sky-400' 
                          : 'border-amber-300 bg-amber-50/60 text-amber-700 shadow-sm hover:border-amber-400'}"
                >
                  <!-- カード上部: 曜日名 -->
                  <span class="text-xs font-bold uppercase tracking-wider block border-b border-slate-200/50 pb-1.5
                    {isFree ? 'text-slate-700' : isNg ? 'text-rose-750' : isFixed ? 'text-sky-750' : 'text-amber-750'}"
                  >
                    {dayName}曜日
                  </span>

                  <!-- カード中部: ステータスアイコン＆表示 -->
                  <div class="flex-grow flex flex-col items-center justify-center py-3">
                    {#if isFree}
                      <div class="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                        <span class="text-base">✅</span>
                        <span class="text-[9px] font-extrabold uppercase">おまかせ</span>
                      </div>
                    {:else if isNg}
                      <div class="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                        <span class="text-base">❌</span>
                        <span class="text-[9px] font-extrabold uppercase">終日NG</span>
                      </div>
                    {:else if isFixed}
                      <div class="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                        <span class="text-base">🌅</span>
                        <span class="text-[9px] font-extrabold uppercase">固定枠</span>
                      </div>
                    {:else}
                      <div class="flex flex-col items-center gap-1 animate-in zoom-in-95 duration-200">
                        <span class="text-base">📝</span>
                        <span class="text-[9px] font-extrabold uppercase">カスタム</span>
                      </div>
                    {/if}
                  </div>

                  <!-- カード下部: 時間帯表記 -->
                  <span class="text-[8px] font-mono font-bold block pt-1 border-t border-slate-200/40 opacity-90">
                    {#if isFree}
                      09:45 〜 20:15
                    {:else if isNg}
                      お休み ☕
                    {:else}
                      {currentTemplate.startTime} 〜 {currentTemplate.endTime}
                    {/if}
                  </span>
                </div>
              {/each}
            </div>
          </section>

        </div>
      {/if}

    </main>

  </div>
</div>

<!-- 【4. 下部固定アクションバー (想定月収進捗ゲージ付き・拡張プレミアムカプセル)】 -->
<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-xl px-4 animate-in slide-in-from-bottom-5 duration-500 select-none">
  <div class="bg-white/96 backdrop-blur-md border border-slate-200/80 p-5 rounded-[28px] shadow-[0_15px_40px_rgba(0,0,0,0.08)] space-y-4">
    
    <!-- リアルタイム希望給料進捗バー -->
    <div class="space-y-1.5">
      <div class="flex justify-between items-center text-[10px] font-bold">
        <span class="text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <span>💰</span>
          <span>今月の想定希望月収</span>
        </span>
        <span class="text-slate-700">
          想定: <span class="font-extrabold text-slate-900 text-xs">¥{expectedMonthlyWage.toLocaleString()}</span> 
          / 目標: <span class="text-slate-500">¥{targetMid.toLocaleString()}</span>
          （達成率: <span class="font-extrabold text-indigo-600">{wageProgressPercent}%</span>）
        </span>
      </div>
      
      <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200/40">
        <div 
          class="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-teal-400 to-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.3)]"
          style="width: {wageProgressPercent}%"
        ></div>
      </div>
    </div>

    <!-- アクション＆提出ステータス -->
    <div class="flex justify-between items-center gap-4 pt-2 border-t border-slate-100/60">
      <div class="text-[10px] text-slate-500 font-bold flex items-center gap-1.5">
        <span class="w-2 h-2 rounded-full {isSyncingWishesNotion ? 'bg-amber-500 animate-pulse' : isDeadlinePassed ? 'bg-amber-400 animate-pulse' : isSubmitted ? 'bg-rose-500' : isLocked ? 'bg-rose-500' : 'bg-indigo-500'}"></span>
        <span>
          {#if isSyncingWishesNotion}
            Notionと同期中... 🔄
          {:else if isDeadlinePassed}
            締め切り経過（修正要望として提出可能） ⚠️
          {:else if isSubmitted}
            提出済み (ロック中) 🔒
          {:else if isLocked}
            システムロック中 🔒
          {:else}
            現在 {wishes.filter(w => w.isOverridden).length} 日分を個別変更中
          {/if}
        </span>
      </div>
      <button 
        type="button"
        onclick={submitWishes}
        disabled={isLocked}
        class="bg-slate-900 hover:bg-slate-800 disabled:bg-slate-150 disabled:text-slate-400 text-white font-extrabold text-xs py-2.5 px-6 rounded-full transition-all duration-300 ease-in-out shadow-sm flex items-center gap-1.5 hover:scale-[1.03] active:scale-95 cursor-pointer disabled:cursor-not-allowed"
      >
        <span>{isDeadlinePassed ? '修正要望として提出する' : isSubmitted ? '提出済み' : 'この内容で提出する'}</span>
        <span>{isLocked ? '🔒' : '🚀'}</span>
      </button>
    </div>

  </div>
</div>

<!-- 提出完了トースト -->
{#if isSavedToast}
  <div class="fixed top-6 right-6 bg-slate-900 text-white border border-slate-800 px-5 py-3.5 rounded-full shadow-2xl z-50 flex items-center gap-2.5 animate-in slide-in-from-top-4 duration-300">
    <span class="text-sm">🎉</span>
    <div>
      <p class="text-xs font-bold">{isDeadlinePassed ? '修正要望を提出しました' : 'シフト希望を提出しました'}</p>
    </div>
  </div>
{/if}

<!-- 【店舗全体シフト詳細ポップアップモーダル】 -->
{#if isDetailModalOpen && detailModalDay}
  {@const dailyShift = detailModalDay.dailyShift}
  {@const workingStaff = getStaffWorkingHoursForDay(dailyShift, staffs)}
  {@const jsDate = parseLocalDate(detailModalDay.dateStr)}
  {@const dayOfWeekName = dayNames[jsDate.getDay()]}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div 
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={() => isDetailModalOpen = false}
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 bg-slate-900/20 backdrop-blur-md z-50 flex items-center justify-center p-4"
  >
    <div 
      role="document"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
      onkeydown={(e) => e.stopPropagation()}
      transition:scale={{ duration: 250, start: 0.94, easing: cubicOut }}
      class="bg-white border border-slate-200 w-full max-w-md rounded-[32px] shadow-[0_24px_50px_rgba(0,0,0,0.12)] p-6 space-y-5 focus:outline-none"
    >
      <!-- モーダルヘッダー -->
      <div class="flex justify-between items-start pb-2 border-b border-slate-100">
        <div>
          <h3 class="text-sm font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
            <span>出勤メンバー一覧</span>
          </h3>
          <p class="text-[10px] text-slate-400 mt-0.5 font-bold">
            日付: <span class="text-slate-800">{targetMonth}月{detailModalDay.day}日 ({dayOfWeekName}曜日)</span>
          </p>
        </div>
        <button 
          type="button"
          onclick={() => isDetailModalOpen = false} 
          class="text-slate-400 hover:text-slate-655 text-lg font-bold p-1 bg-slate-50 rounded-full transition duration-300"
        >
          ✕
        </button>
      </div>

      <!-- モーダルコンテンツ: 出勤スタッフ一覧 -->
      <div class="space-y-3 max-h-[320px] overflow-y-auto pr-1">
        {#if workingStaff.length === 0}
          <div class="text-center py-10 text-slate-450 italic text-xs flex flex-col items-center justify-center gap-2">
            <span class="text-2xl">☕</span>
            <span>この日は出勤メンバーがいません（お休み）</span>
          </div>
        {:else}
          {#each workingStaff as assign}
            {@const isSelf = assign.staffId === userId}
            <div 
              class="flex justify-between items-center p-3 rounded-2xl border transition duration-300
                {isSelf 
                  ? 'bg-indigo-50/50 border-indigo-200 shadow-[0_0_12px_rgba(99,102,241,0.1)] ring-1 ring-indigo-200/50' 
                  : 'bg-slate-50 border-slate-200/60'}"
            >
              <div class="flex items-center gap-2.5">
                <span class="px-2 py-0.5 rounded-full text-[8px] font-bold tracking-wider
                  {assign.role === 'employee' ? 'bg-emerald-50 border border-emerald-100 text-emerald-600' :
                   assign.role === 'adult' ? 'bg-sky-50 border border-sky-100 text-sky-600' :
                   'bg-amber-50 border border-amber-100 text-amber-600'}"
                >
                  {#if assign.role === 'employee'}社員{:else if assign.role === 'adult'}成人{:else}未成年{/if}
                </span>
                <span class="font-extrabold text-xs text-slate-800">{assign.staffName}</span>
                {#if isSelf}
                  <span class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-600 text-white font-extrabold">あなた</span>
                {/if}
              </div>
              <div class="text-[11px] font-extrabold text-slate-700 font-mono flex items-center gap-1.5">
                <span>⏰ {assign.timeRangeStr}</span>
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- モーダルアクション -->
      <div class="flex justify-end pt-2 border-t border-slate-100">
        <button 
          type="button"
          onclick={() => isDetailModalOpen = false} 
          class="bg-slate-900 hover:bg-slate-800 text-white font-bold px-6 py-2.5 rounded-full transition-all duration-300 ease-in-out text-xs shadow-sm"
        >
          閉じる
        </button>
      </div>

    </div>
  </div>
{/if}

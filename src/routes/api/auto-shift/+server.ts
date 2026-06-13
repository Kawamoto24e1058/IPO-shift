import { json, type RequestHandler } from '@sveltejs/kit';
import { GoogleGenAI, Type } from '@google/genai';
import { env } from '$env/dynamic/private';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const apiKey = env.GEMINI_API_KEY;
		if (!apiKey) {
			return json(
				{ error: 'GEMINI_API_KEY is not configured in private environment variables.' },
				{ status: 500 }
			);
		}

		const body = await request.json();
		const { year, month, staffs, wishesMapByDate, unicesEventsByDate, fsDaysByDate } = body;

		if (!year || !month || !staffs) {
			return json({ error: 'Missing required parameters: year, month, staffs.' }, { status: 400 });
		}

		const lastDay = new Date(year, month, 0).getDate();

		// ===================================================
		// Step 2: インプットデータの最小軽量化（トークン削減）
		// ===================================================

		// 1. 各スタッフ情報の軽量化
		const minifiedStaffs = staffs.map((s: any) => {
			// そのスタッフの休み希望 (ng) の日付配列を抽出
			const offDates: string[] = [];
			const wishes: { [date: string]: string } = {};

			for (let d = 1; d <= lastDay; d++) {
				const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
				const dayWishes = wishesMapByDate?.[dateStr] || {};
				const wish = dayWishes[s.id];
				if (wish) {
					if (wish.type === 'ng') {
						offDates.push(dateStr);
					} else if (wish.type === 'specific') {
						wishes[dateStr] = `${wish.startTime || '09:45'}-${wish.endTime || '20:15'}`;
					} else if (wish.type === 'free') {
						wishes[dateStr] = 'free';
					}
				}
			}

			return {
				id: s.id,
				name: s.name,
				role: s.role,
				hourly_wage:
					Number(s.hourlyWage || s.hourly_wage) ||
					(s.role === 'employee' ? 1500 : (s.age_group || s.role) === 'adult' ? 1200 : 1100),
				target_monthly_income: s.target_monthly_income || 50000,
				max_monthly_income: s.max_monthly_income || 80000,
				isTrainee: !!(s.is_trainee || s.isTrainee),
				minor: (s.age_group || s.role) === 'minor',
				offDates,
				wishes
			};
		});

		// 2. 空きスロット（席）データの生成
		const minifiedSlots: any[] = [];
		for (let d = 1; d <= lastDay; d++) {
			const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

			// カフェ前半 (CW AM) × 2枠
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

			// カフェ後半 (CW PM) × 2枠
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
		// Step 3: 厳格なシステム指示書 (systemInstruction) の定義
		// ===================================================
		const systemInstruction = `
あなたは数理最適化と店舗運営に精通した天才AI店長です。提供された「スタッフデータ」と「空きスロット」をもとに、1ヶ月分のシフト表を作成してください。

【絶対死守ルール】
1. 休み希望（offDates）の日には、そのスタッフを絶対に1分たりとも配置しないでください。
2. 1回の割り当てにつき、連続で「最低3時間」以上になるように大きな塊で配置してください。15分や30分などの細切れ出勤は絶対に禁止です。
3. 各スタッフの想定支給額（時給×合計時間）が、個人の「絶対上限月収（max_monthly_income、未設定なら80000）」を1円でも超えないように厳重にブロックしてください。
4. カフェ枠において、研修生（isTrainee: true）や未成年（minor: true）同士がペア（同じスロットに2人だけ）になる配置は絶対に禁止です（必ず大人、または社員が1名以上ペアになります）。

【分配・平準化の方針】
- スタッフの雇用形態（社員・バイト）に関わらず、全員の給与がそれぞれの「希望月収（target_monthly_income、未設定なら50000）」に対して満遍なく【均等な進捗率（％）】で伸びるように、月全体に薄く引き伸ばして分配してください。
- 特定のスタッフにシフトが連続して偏ったり、社員が連続勤務で過労になったりしないよう、バケツリレーのように綺麗に分散させてください。
- 全員が希望月収に達し、あるいは上限に達して入れる人がいないスロットは、無理にアサインせずスタッフIDを空文字（未充足）のまま残してください。
`;

		// ===================================================
		// Step 4: Structured Outputs（構造化出力）によるJSON強制返却
		// ===================================================
		const ai = new GoogleGenAI({ apiKey });
		const response = await ai.models.generateContent({
			model: 'gemini-3.1-pro',
			contents: JSON.stringify({ staffs: minifiedStaffs, slots: minifiedSlots }),
			config: {
				systemInstruction,
				temperature: 0.1,
				responseMimeType: 'application/json',
				responseSchema: {
					type: Type.OBJECT,
					properties: {
						assignments: {
							type: Type.ARRAY,
							items: {
								type: Type.OBJECT,
								properties: {
									date: { type: Type.STRING },
									slotId: { type: Type.STRING },
									startTime: { type: Type.STRING },
									endTime: { type: Type.STRING },
									assignedStaffId: {
										type: Type.STRING,
										description: 'Assigned staff ID, or empty string if unassigned'
									}
								},
								required: ['date', 'slotId', 'startTime', 'endTime', 'assignedStaffId']
							}
						}
					},
					required: ['assignments']
				}
			}
		});

		const responseText = response.text;
		if (!responseText) {
			return json({ error: 'Empty response received from Gemini.' }, { status: 500 });
		}

		const result = JSON.parse(responseText);
		return json(result);
	} catch (e: any) {
		console.error('Failed to generate shifts via Gemini API:', e);
		return json({ error: e.message || 'Internal server error.' }, { status: 500 });
	}
};

import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/firebase';
import { doc, getDoc } from 'firebase/firestore';
import { runPureMathAutoShiftEngine } from '$lib/services/pureMathSolverEngine';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { year, month, staffs, wishesMapByDate, unicesEventsByDate, fsDaysByDate } = body;

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

		const result = runPureMathAutoShiftEngine({
			year,
			month,
			staffs,
			wishesMapByDate,
			unicesEventsByDate,
			fsDaysByDate,
			eventDates
		});

		return json(result);
	} catch (e: any) {
		console.error('Failed to generate shifts via Pure Math Solver:', e);
		return json({ error: e.message || 'Internal server error.' }, { status: 500 });
	}
};

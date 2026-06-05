import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { NOTION_API_TOKEN, NOTION_CONFIRMED_DATABASE_ID } from '$env/static/private';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { date, records } = await request.json();
    
    // 環境変数が設定されていない場合は、詳細ログを出力した上でエラーを返します
    if (!NOTION_API_TOKEN || !NOTION_CONFIRMED_DATABASE_ID) {
      console.warn('[Notion Confirmed API] NOTION_API_TOKEN or NOTION_CONFIRMED_DATABASE_ID is not configured in the .env file.');
      return json({ success: false, error: 'Notion credentials are not configured in .env file.' }, { status: 500 });
    }

    console.log(`[Notion Confirmed API] Querying existing shifts for date: ${date}...`);
    
    // 1. 重複登録を防ぐため、対象日の既存レコードをNotion側から取得してアーカイブ（削除）します
    const queryResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_CONFIRMED_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          property: '日付',
          date: {
            equals: date
          }
        }
      })
    });

    if (queryResponse.ok) {
      const queryData = await queryResponse.json();
      const existingPages = queryData.results || [];
      
      if (existingPages.length > 0) {
        console.log(`[Notion Confirmed API] Archiving ${existingPages.length} existing pages for date ${date} to prevent duplicates...`);
        // 既存のページを並行してアーカイブ化（削除）
        await Promise.all(existingPages.map(async (page: any) => {
          try {
            await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
              method: 'PATCH',
              headers: {
                'Authorization': `Bearer ${NOTION_API_TOKEN}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ archived: true })
            });
          } catch (e) {
            console.error(`[Notion Confirmed API] Failed to archive page ${page.id}:`, e);
          }
        }));
      }
    } else {
      const errText = await queryResponse.text();
      console.warn(`[Notion Confirmed API] Query failed: ${queryResponse.status} ${errText}`);
    }

    // 2. 新しい確定シフト一覧をNotionデータベースに保存（1人・1日＝1ページとして追加）
    console.log(`[Notion Confirmed API] Inserting ${records.length} new confirmed shift records...`);
    const insertResults = await Promise.all(records.map(async (rec: any) => {
      try {
        // エリア名の決定
        const areaName = rec.areas.includes('cafe') && rec.areas.includes('unices')
          ? '混合'
          : rec.areas.includes('unices')
            ? 'UNICES'
            : rec.areas.includes('cafe')
              ? 'Cafe'
              : '未設定';

        // プロパティマップの作成
        const properties: any = {
          'シフト名': {
            title: [
              { text: { content: `[確定] ${date} ${rec.name}` } }
            ]
          },
          '日付': {
            date: { start: date }
          },
          'ユーザーID': {
            rich_text: [
              { text: { content: rec.uid || rec.staffId } }
            ]
          },
          '開始時間': {
            rich_text: [
              { text: { content: rec.startTime || '' } }
            ]
          },
          '終了時間': {
            rich_text: [
              { text: { content: rec.endTime || '' } }
            ]
          },
          'エリア': {
            select: { name: areaName }
          }
        };

        // 「スタッフ名」プロパティ（Person属性）の設定
        // Firestoreの users コレクションに `notion_person_id` が存在する場合のみセット
        if (rec.notion_person_id) {
          properties['スタッフ名'] = {
            people: [
              { id: rec.notion_person_id }
            ]
          };
        } else {
          console.log(`[Notion Confirmed API] Staff ${rec.name} has no notion_person_id. Skipping Person attribute.`);
        }

        const response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_API_TOKEN}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: NOTION_CONFIRMED_DATABASE_ID },
            properties
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(`[Notion Confirmed API] Failed to insert row for ${rec.name}: ${response.status} ${errText}`);
          return false;
        }

        return true;
      } catch (e) {
        console.error(`[Notion Confirmed API] Failed to insert row for ${rec.name}:`, e);
        return false;
      }
    }));

    const successCount = insertResults.filter(Boolean).length;
    console.log(`[Notion Confirmed API] Successfully synced ${successCount}/${records.length} shift records to Notion.`);
    return json({ success: true, count: successCount });
  } catch (err: any) {
    console.error('[Notion Confirmed API] Server Error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const NOTION_API_TOKEN = env.NOTION_API_TOKEN;
const NOTION_WISHES_DATABASE_ID = env.NOTION_WISHES_DATABASE_ID;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { userId, year, month, wishes } = await request.json();
    
    // 環境変数が設定されていない場合は、詳細ログを出力した上でエラーを返します
    if (!NOTION_API_TOKEN || !NOTION_WISHES_DATABASE_ID) {
      console.warn('[Notion API Server] NOTION_API_TOKEN or NOTION_WISHES_DATABASE_ID is not configured in the .env file.');
      return json({ success: false, error: 'Notion credentials are not configured in .env file.' }, { status: 500 });
    }

    // 1. 重複登録を防ぐため、対象月・対象ユーザーの既存レコードをNotion側から取得してアーカイブ（削除）します
    const startDateStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    console.log(`[Notion API Server] Querying existing wishes for ${userId} between ${startDateStr} and ${endDateStr}...`);
    
    const queryResponse = await fetch(`https://api.notion.com/v1/databases/${NOTION_WISHES_DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'スタッフID',
              title: {
                equals: userId
              }
            },
            {
              property: '日付',
              date: {
                on_or_after: startDateStr
              }
            },
            {
              property: '日付',
              date: {
                on_or_before: endDateStr
              }
            }
          ]
        }
      })
    });

    if (queryResponse.ok) {
      const queryData = await queryResponse.json();
      const existingPages = queryData.results || [];
      
      if (existingPages.length > 0) {
        console.log(`[Notion API Server] Archiving ${existingPages.length} existing pages to prevent duplicates...`);
        // 既存のページを並行してアーカイブ化（削除）
        await Promise.all(existingPages.map(async (page: any) => {
          await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${NOTION_API_TOKEN}`,
              'Notion-Version': '2022-06-28',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ archived: true })
          });
        }));
      }
    } else {
      const errText = await queryResponse.text();
      console.warn(`[Notion API Server] Query failed: ${queryResponse.status} ${errText}`);
    }

    // 2. 新しい希望シフト一覧をNotionデータベースに保存（1行＝1ページとして追加）
    console.log(`[Notion API Server] Inserting ${wishes.length} new wishes...`);
    const insertResults = await Promise.all(wishes.map(async (w: any) => {
      try {
        const response = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${NOTION_API_TOKEN}`,
            'Notion-Version': '2022-06-28',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            parent: { database_id: NOTION_WISHES_DATABASE_ID },
            properties: {
              'スタッフID': {
                title: [
                  { text: { content: userId } }
                ]
              },
              '日付': {
                date: { start: w.date }
              },
              '希望区分': {
                select: { name: w.type === 'specific' ? '特定時間' : w.type === 'ng' ? 'NG' : 'おまかせ' }
              },
              '開始時間': {
                rich_text: [
                  { text: { content: w.startTime || '' } }
                ]
              },
              '終了時間': {
                rich_text: [
                  { text: { content: w.endTime || '' } }
                ]
              },
              '個別上書き': {
                checkbox: w.isOverridden
              }
            }
          })
        });
        return response.ok;
      } catch (e) {
        console.error('[Notion API Server] Failed to insert row:', e);
        return false;
      }
    }));

    const successCount = insertResults.filter(Boolean).length;
    console.log(`[Notion API Server] Successfully synced ${successCount}/${wishes.length} wishes to Notion.`);
    return json({ success: true, count: successCount });
  } catch (err: any) {
    console.error('[Notion API Server] Server Error:', err);
    return json({ success: false, error: err.message }, { status: 500 });
  }
};

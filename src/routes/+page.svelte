<!-- src/routes/+page.svelte -->
<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { authState } from '../lib/services/authService.svelte.ts';

  // ログアウト処理
  async function handleLogout() {
    await authState.logout();
    window.location.href = '/login';
  }
</script>

{#if authState.user}
  <div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-between transition-colors duration-350">
    <!-- 上部: ナビゲーションバー (Instagramミニマルスタイル) -->
    <header class="w-full max-w-6xl mx-auto px-6 py-6 flex justify-between items-center border-b border-slate-200/60 bg-slate-50/80 backdrop-blur-md sticky top-0 z-30">
      <div class="flex items-center gap-2">
        <span class="text-xl font-bold tracking-tight text-slate-900 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 bg-clip-text text-transparent">
          IPO Shift
        </span>
        <span class="text-[9px] bg-slate-200/80 text-slate-600 px-2 py-0.5 rounded-full font-bold">
          v2.0
        </span>
        {#if authState.isOfflineMode}
          <span class="text-[8px] bg-amber-500 text-white font-extrabold px-1.5 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
            Offline Mode
          </span>
        {/if}
      </div>

      <!-- ログイン中のユーザー情報 & ログアウト -->
      <div class="flex items-center gap-3">
        <div class="flex flex-col text-right hidden sm:flex">
          <span class="text-xs font-bold text-slate-800">{authState.user.name}</span>
          <span class="text-[9px] text-slate-450 font-medium">
            {#if authState.user.role === 'employee'}社員 (管理者){:else if authState.user.role === 'adult'}成人スタッフ{:else}未成年スタッフ{/if}
          </span>
        </div>
        <button 
          type="button"
          onclick={handleLogout}
          class="bg-white border border-slate-200 hover:border-slate-350 text-slate-500 hover:text-slate-800 text-[10px] font-bold py-1.5 px-3.5 rounded-full transition duration-300 shadow-sm"
        >
          ログアウト ✕
        </button>
      </div>
    </header>

    <!-- メインヒーロー & ナビゲーションカード -->
    <main class="flex-grow max-w-4xl mx-auto px-6 py-12 md:py-16 flex flex-col justify-center items-center space-y-12">
      
      <!-- キャッチコピー -->
      <div class="text-center space-y-4 max-w-2xl animate-in fade-in duration-500">
        <div class="inline-flex items-center gap-1.5 bg-indigo-50 border border-indigo-100/60 px-3 py-1 rounded-full text-[10px] text-indigo-600 font-extrabold tracking-wider uppercase">
          <span>✨ Welcome, {authState.user.name}</span>
        </div>
        <h1 class="text-3xl md:text-5xl font-black text-slate-900 tracking-tight leading-tight">
          店舗シフト調整を、<br/>
          <span class="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent">もっと滑らかに、美しく。</span>
        </h1>
        <p class="text-xs md:text-sm text-slate-500 leading-relaxed max-w-lg mx-auto">
          曜日テンプレートからの自動データ補完、Instagram風のスムーズな希望入力モーダル、そして管理者のリアルタイム警告灯バリデーションと自動生成アルゴリズム。これらすべてを一つにした、プレミアムなシフト作成アプリです。
        </p>
      </div>

      <!-- 2大機能選択カード (2カラム) -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl">
        
        <!-- カード1: スタッフ向け希望提出 -->
        <a 
          href="/wishes"
          class="group bg-white border border-slate-200/80 rounded-[32px] p-8 flex flex-col justify-between space-y-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:border-slate-350 hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)] hover:scale-[1.02] active:scale-[0.98]"
        >
          <div class="space-y-4">
            <div class="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl shadow-xs transition group-hover:scale-115">
              📅
            </div>
            <div class="space-y-1">
              <h2 class="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                <span>シフト希望提出</span>
                <span class="text-xs text-emerald-500 opacity-0 group-hover:opacity-100 transition duration-300">→</span>
              </h2>
              <p class="text-xs text-slate-400 leading-relaxed">
                カレンダーから直感的に希望を提出。曜日ごとのテンプレート設定による自動入力補完機能や、Instagram風の滑らかに浮かび上がるモーダルでの個別変更に対応しています。
              </p>
            </div>
          </div>

          <div class="flex items-center gap-2 text-[10px] text-slate-500 font-bold border-t border-slate-100 pt-4">
            <span class="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-600">スタッフ向け</span>
            <span>• 締め切り手動/自動ロック対応</span>
          </div>
        </a>

        <!-- カード2: 管理者向けシフト調整 -->
        {#if authState.user.isAdmin}
          <!-- 管理者の場合は自由にアクセス可能 -->
          <a 
            href="/admin/shifts"
            class="group bg-white border border-slate-200/80 rounded-[32px] p-8 flex flex-col justify-between space-y-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:border-slate-350 hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)] hover:scale-[1.02] active:scale-[0.98]"
          >
            <div class="space-y-4">
              <div class="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xl shadow-xs transition group-hover:scale-115">
                ⚙️
              </div>
              <div class="space-y-1">
                <h2 class="text-lg font-bold text-slate-800 flex items-center gap-1.5">
                  <span>シフト調整コンソール</span>
                  <span class="text-xs text-indigo-500 opacity-0 group-hover:opacity-100 transition duration-300">→</span>
                </h2>
                <p class="text-xs text-slate-400 leading-relaxed">
                  AI自動生成アルゴリズムによる最適アサイン。15分単位のタイムラインで直感的な手動微調整が可能で、ワンオペや深夜ルール等の違反をリアルタイム警告灯で可視化します。
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-bold border-t border-slate-100 pt-4">
              <span class="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600">管理者専用</span>
              <span>• リアルタイム警告灯バリデーション</span>
            </div>
          </a>
        {:else}
          <!-- スタッフの場合はロックアイコン付きの非アクティブカード（管理者制限の通知） -->
          <div 
            class="bg-slate-100/50 border border-slate-250/30 rounded-[32px] p-8 flex flex-col justify-between space-y-8 shadow-[0_8px_30px_rgb(0,0,0,0.005)] relative overflow-hidden opacity-85 select-none"
          >
            <div class="space-y-4">
              <div class="w-12 h-12 rounded-2xl bg-slate-200 border border-slate-300/50 flex items-center justify-center text-xl shadow-xs">
                🔒
              </div>
              <div class="space-y-1">
                <h2 class="text-lg font-bold text-slate-450 flex items-center gap-1.5">
                  <span>シフト調整コンソール</span>
                </h2>
                <p class="text-xs text-slate-400 leading-relaxed">
                  ※この機能は管理者（社員）アカウント専用に制限されています。一般スタッフアカウントからは操作できません。
                </p>
              </div>
            </div>

            <div class="flex items-center gap-2 text-[10px] text-slate-400 font-bold border-t border-slate-200/50 pt-4">
              <span class="px-2 py-0.5 rounded-full bg-slate-200 border border-slate-300 text-slate-500 font-medium">アクセス制限</span>
              <span>• 管理者アカウントでログインしてください</span>
            </div>
          </div>
        {/if}

      </div>

      <!-- ミニチュートリアル／特徴 -->
      <div class="bg-white/60 border border-slate-200/50 rounded-3xl p-6 w-full max-w-3xl flex flex-col md:flex-row justify-between gap-6 text-[11px] text-slate-500 leading-relaxed shadow-xs">
        <div class="flex-1 space-y-1.5">
          <span class="font-bold text-slate-700 block">✨ 曜日別テンプレート</span>
          <span>月間希望のロード時に自動引き当てが行われ、手動での1マスずつの入力ストレスを最小限に抑えます。</span>
        </div>
        <div class="w-px bg-slate-200/60 hidden md:block"></div>
        <div class="flex-1 space-y-1.5">
          <span class="font-bold text-slate-700 block">🎨 高級Instagram風デザイン</span>
          <span>ギラギラした原色を排除し、淡いニュアンスアースカラー、`backdrop-blur` による半透明背景、滑らかなイージングを使用。</span>
        </div>
        <div class="w-px bg-slate-200/60 hidden md:block"></div>
        <div class="flex-1 space-y-1.5">
          <span class="font-bold text-slate-700 block">⚡ 自動アサイン & 警告</span>
          <span>UNICES開催日の自動配置スライドロジックを搭載。違反スロットをリアルタイムで検知し、安全なシフト作成を支援。</span>
        </div>
      </div>

    </main>

    <!-- 下部: フッター -->
    <footer class="w-full max-w-6xl mx-auto px-6 py-8 border-t border-slate-200/40 text-center text-[10px] text-slate-400 font-medium">
      &copy; 2026 IPO Shift. Crafted with Svelte 5 and Tailwind CSS v4.
    </footer>
  </div>
{/if}

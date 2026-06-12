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
	<div
		class="flex min-h-screen flex-col justify-between bg-slate-50 font-sans text-slate-800 transition-colors duration-350"
	>
		<!-- 上部: ナビゲーションバー (Instagramミニマルスタイル) -->
		<header
			class="sticky top-0 z-30 mx-auto flex w-full max-w-6xl items-center justify-between border-b border-slate-200/60 bg-slate-50/80 px-6 py-6 backdrop-blur-md"
		>
			<div class="flex items-center gap-2">
				<span
					class="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-900 bg-clip-text text-xl font-bold tracking-tight text-slate-900 text-transparent"
				>
					IPO Shift
				</span>
				<span class="rounded-full bg-slate-200/80 px-2 py-0.5 text-[9px] font-bold text-slate-600">
					v2.0
				</span>
				{#if authState.isOfflineMode}
					<span
						class="animate-pulse rounded-full bg-amber-500 px-1.5 py-0.5 text-[8px] font-extrabold tracking-wider text-white uppercase"
					>
						Offline Mode
					</span>
				{/if}
			</div>

			<!-- ログイン中のユーザー情報 & ログアウト -->
			<div class="flex items-center gap-3">
				<div class="flex hidden flex-col text-right sm:flex">
					<span class="text-xs font-bold text-slate-800">{authState.user.name}</span>
					<span class="text-slate-450 text-[9px] font-medium">
						{#if authState.user.role === 'employee'}社員 (管理者){:else if authState.user.role === 'adult'}成人スタッフ{:else}未成年スタッフ{/if}
					</span>
				</div>
				<button
					type="button"
					onclick={handleLogout}
					class="hover:border-slate-350 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[10px] font-bold text-slate-500 shadow-sm transition duration-300 hover:text-slate-800"
				>
					ログアウト ✕
				</button>
			</div>
		</header>

		<!-- メインヒーロー & ナビゲーションカード -->
		<main
			class="mx-auto flex max-w-4xl flex-grow flex-col items-center justify-center space-y-12 px-6 py-12 md:py-16"
		>
			<!-- キャッチコピー -->
			<div class="animate-in fade-in max-w-2xl space-y-4 text-center duration-500">
				<div
					class="inline-flex items-center gap-1.5 rounded-full border border-indigo-100/60 bg-indigo-50 px-3 py-1 text-[10px] font-extrabold tracking-wider text-indigo-600 uppercase"
				>
					<span>✨ Welcome, {authState.user.name}</span>
				</div>
				<h1 class="text-3xl leading-tight font-black tracking-tight text-slate-900 md:text-5xl">
					店舗シフト調整を、<br />
					<span class="bg-gradient-to-r from-indigo-600 to-sky-500 bg-clip-text text-transparent"
						>もっと滑らかに、美しく。</span
					>
				</h1>
				<p class="mx-auto max-w-lg text-xs leading-relaxed text-slate-500 md:text-sm">
					曜日テンプレートからの自動データ補完、Instagram風のスムーズな希望入力モーダル、そして管理者のリアルタイム警告灯バリデーションと自動生成アルゴリズム。これらすべてを一つにした、プレミアムなシフト作成アプリです。
				</p>
			</div>

			<!-- 2大機能選択カード (2カラム) -->
			<div class="grid w-full max-w-3xl grid-cols-1 gap-6 md:grid-cols-2">
				<!-- カード1: スタッフ向け希望提出 -->
				<a
					href="/wishes"
					class="group hover:border-slate-350 flex flex-col justify-between space-y-8 rounded-[32px] border border-slate-200/80 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)] active:scale-[0.98]"
				>
					<div class="space-y-4">
						<div
							class="flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-xl shadow-xs transition group-hover:scale-115"
						>
							📅
						</div>
						<div class="space-y-1">
							<h2 class="flex items-center gap-1.5 text-lg font-bold text-slate-800">
								<span>シフト希望提出</span>
								<span
									class="text-xs text-emerald-500 opacity-0 transition duration-300 group-hover:opacity-100"
									>→</span
								>
							</h2>
							<p class="text-xs leading-relaxed text-slate-400">
								カレンダーから直感的に希望を提出。曜日ごとのテンプレート設定による自動入力補完機能や、Instagram風の滑らかに浮かび上がるモーダルでの個別変更に対応しています。
							</p>
						</div>
					</div>

					<div
						class="flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-500"
					>
						<span
							class="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-emerald-600"
							>スタッフ向け</span
						>
						<span>• 締め切り手動/自動ロック対応</span>
					</div>
				</a>

				<!-- カード2: 管理者向けシフト調整 -->
				{#if authState.user.isAdmin}
					<!-- 管理者の場合は自由にアクセス可能 -->
					<a
						href="/admin/shifts"
						class="group hover:border-slate-350 flex flex-col justify-between space-y-8 rounded-[32px] border border-slate-200/80 bg-white p-8 shadow-[0_8px_30px_rgb(0,0,0,0.015)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.03)] active:scale-[0.98]"
					>
						<div class="space-y-4">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-xl shadow-xs transition group-hover:scale-115"
							>
								⚙️
							</div>
							<div class="space-y-1">
								<h2 class="flex items-center gap-1.5 text-lg font-bold text-slate-800">
									<span>シフト調整コンソール</span>
									<span
										class="text-xs text-indigo-500 opacity-0 transition duration-300 group-hover:opacity-100"
										>→</span
									>
								</h2>
								<p class="text-xs leading-relaxed text-slate-400">
									AI自動生成アルゴリズムによる最適アサイン。15分単位のタイムラインで直感的な手動微調整が可能で、ワンオペや深夜ルール等の違反をリアルタイム警告灯で可視化します。
								</p>
							</div>
						</div>

						<div
							class="flex items-center gap-2 border-t border-slate-100 pt-4 text-[10px] font-bold text-slate-500"
						>
							<span
								class="rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-indigo-600"
								>管理者専用</span
							>
							<span>• リアルタイム警告灯バリデーション</span>
						</div>
					</a>
				{:else}
					<!-- スタッフの場合はロックアイコン付きの非アクティブカード（管理者制限の通知） -->
					<div
						class="border-slate-250/30 relative flex flex-col justify-between space-y-8 overflow-hidden rounded-[32px] border bg-slate-100/50 p-8 opacity-85 shadow-[0_8px_30px_rgb(0,0,0,0.005)] select-none"
					>
						<div class="space-y-4">
							<div
								class="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-300/50 bg-slate-200 text-xl shadow-xs"
							>
								🔒
							</div>
							<div class="space-y-1">
								<h2 class="text-slate-450 flex items-center gap-1.5 text-lg font-bold">
									<span>シフト調整コンソール</span>
								</h2>
								<p class="text-xs leading-relaxed text-slate-400">
									※この機能は管理者（社員）アカウント専用に制限されています。一般スタッフアカウントからは操作できません。
								</p>
							</div>
						</div>

						<div
							class="flex items-center gap-2 border-t border-slate-200/50 pt-4 text-[10px] font-bold text-slate-400"
						>
							<span
								class="rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 font-medium text-slate-500"
								>アクセス制限</span
							>
							<span>• 管理者アカウントでログインしてください</span>
						</div>
					</div>
				{/if}
			</div>

			<!-- ミニチュートリアル／特徴 -->
			<div
				class="flex w-full max-w-3xl flex-col justify-between gap-6 rounded-3xl border border-slate-200/50 bg-white/60 p-6 text-[11px] leading-relaxed text-slate-500 shadow-xs md:flex-row"
			>
				<div class="flex-1 space-y-1.5">
					<span class="block font-bold text-slate-700">✨ 曜日別テンプレート</span>
					<span
						>月間希望のロード時に自動引き当てが行われ、手動での1マスずつの入力ストレスを最小限に抑えます。</span
					>
				</div>
				<div class="hidden w-px bg-slate-200/60 md:block"></div>
				<div class="flex-1 space-y-1.5">
					<span class="block font-bold text-slate-700">🎨 高級Instagram風デザイン</span>
					<span
						>ギラギラした原色を排除し、淡いニュアンスアースカラー、`backdrop-blur`
						による半透明背景、滑らかなイージングを使用。</span
					>
				</div>
				<div class="hidden w-px bg-slate-200/60 md:block"></div>
				<div class="flex-1 space-y-1.5">
					<span class="block font-bold text-slate-700">⚡ 自動アサイン & 警告</span>
					<span
						>UNICES開催日の自動配置スライドロジックを搭載。違反スロットをリアルタイムで検知し、安全なシフト作成を支援。</span
					>
				</div>
			</div>
		</main>

		<!-- 下部: フッター -->
		<footer
			class="mx-auto w-full max-w-6xl border-t border-slate-200/40 px-6 py-8 text-center text-[10px] font-medium text-slate-400"
		>
			&copy; 2026 IPO Shift. Crafted with Svelte 5 and Tailwind CSS v4.
		</footer>
	</div>
{/if}

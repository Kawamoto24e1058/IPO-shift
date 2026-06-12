<!-- src/routes/login/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import { authState } from '../../lib/services/authService.svelte.ts';

	// タブステート ('login' = メールログイン, 'register' = 登録)
	let activeTab = $state<'login' | 'register'>('login');

	// フォームインプット
	let email = $state('');
	let password = $state('');
	let registerEmail = $state('');
	let registerPassword = $state('');
	let registerName = $state('');
	let registerRole = $state<'employee' | 'adult' | 'minor'>('adult');

	// エラー・ローディング制御
	let errorMessage = $state('');
	let successMessage = $state('');
	let isSubmitting = $state(false);

	// ログイン成功時に自動遷移させる
	onMount(() => {
		// 既にログイン済みの場合はトップへ
		if (authState.user && !authState.loading) {
			window.location.href = '/';
		}
	});

	// authState.userの監視
	$effect(() => {
		if (authState.user) {
			successMessage = `ようこそ、${authState.user.name} さん！`;
			setTimeout(() => {
				window.location.href = '/';
			}, 1000);
		}
	});

	// メールアドレスログイン実行
	async function handleEmailLogin(e: SubmitEvent) {
		e.preventDefault();
		if (!email || !password) {
			errorMessage = 'メールアドレスとパスワードを入力してください。';
			return;
		}
		isSubmitting = true;
		errorMessage = '';
		try {
			await authState.loginWithEmail(email, password);
		} catch (e: any) {
			errorMessage = e.message || 'ログインに失敗しました。認証情報を確認してください。';
		} finally {
			isSubmitting = false;
		}
	}

	// 新規スタッフ登録実行
	async function handleRegister(e: SubmitEvent) {
		e.preventDefault();
		if (!registerEmail || !registerPassword || !registerName) {
			errorMessage = 'すべての項目を入力してください。';
			return;
		}
		isSubmitting = true;
		errorMessage = '';
		try {
			await authState.registerWithEmail(
				registerEmail,
				registerPassword,
				registerName,
				registerRole
			);
			successMessage = '新規登録が完了しました！';
		} catch (e: any) {
			errorMessage = e.message || '登録に失敗しました。';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div
	class="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-50 p-4 font-sans text-slate-800 select-none"
>
	<!-- プレミアムなバックグラウンドグラデーション球体 -->
	<div class="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl"></div>
	<div class="absolute -right-40 -bottom-40 h-96 w-96 rounded-full bg-sky-200/30 blur-3xl"></div>

	<div
		class="animate-in fade-in relative z-10 w-full max-w-md space-y-8 rounded-[32px] border border-slate-200/80 bg-white p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] backdrop-blur-md duration-500"
	>
		<!-- アプリロゴ -->
		<div class="space-y-2 text-center">
			<span
				class="rounded-full border border-indigo-100/80 bg-indigo-50 px-3 py-1 text-[10px] font-bold tracking-wider text-indigo-600 uppercase"
			>
				🔐 IPO Shift Portal
			</span>
			<h1 class="text-3xl font-black tracking-tight text-slate-900">ログイン</h1>
			<p class="text-xs font-medium text-slate-400">シフト希望提出 ＆ 調整管理システム</p>
		</div>

		<!-- 通知・エラーメッセージ -->
		{#if errorMessage}
			<div
				transition:fade={{ duration: 200 }}
				class="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs leading-relaxed font-semibold text-rose-600"
			>
				⚠️ {errorMessage}
			</div>
		{/if}

		{#if successMessage}
			<div
				transition:fade={{ duration: 200 }}
				class="flex animate-pulse items-center justify-center gap-1.5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-center text-xs font-semibold text-emerald-600"
			>
				<span>✨</span>
				<span>{successMessage}</span>
			</div>
		{/if}

		<!-- タブナビゲーション (Instagramカプセル風) -->
		<nav class="flex rounded-2xl border border-slate-200/50 bg-slate-100 p-1 shadow-inner">
			<button
				type="button"
				onclick={() => {
					activeTab = 'login';
					errorMessage = '';
				}}
				class="flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-extrabold transition duration-300
          {activeTab === 'login'
					? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50'
					: 'text-slate-500 hover:text-slate-800'}"
			>
				<span>✉️</span>
				<span>ログイン</span>
			</button>
			<button
				type="button"
				onclick={() => {
					activeTab = 'register';
					errorMessage = '';
				}}
				class="flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-xs font-extrabold transition duration-300
          {activeTab === 'register'
					? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50'
					: 'text-slate-500 hover:text-slate-800'}"
			>
				<span>＋</span>
				<span>新規登録</span>
			</button>
		</nav>

		<!-- フォーム本体 -->
		<div class="flex min-h-[250px] flex-col justify-center">
			<!-- 2. 本番用メールアドレスログイン -->
			{#if activeTab === 'login'}
				<form onsubmit={handleEmailLogin} in:fade={{ duration: 250 }} class="space-y-5 text-xs">
					<div>
						<label for="login-email" class="mb-1 block text-slate-400">メールアドレス</label>
						<input
							id="login-email"
							type="email"
							bind:value={email}
							disabled={isSubmitting || !!successMessage}
							placeholder="email@example.com"
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all duration-300 focus:border-slate-400 focus:bg-white focus:outline-none"
						/>
					</div>

					<div>
						<label for="login-pass" class="mb-1 block text-slate-400">パスワード</label>
						<input
							id="login-pass"
							type="password"
							bind:value={password}
							disabled={isSubmitting || !!successMessage}
							placeholder="••••••••"
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all duration-300 focus:border-slate-400 focus:bg-white focus:outline-none"
						/>
					</div>

					<button
						type="submit"
						disabled={isSubmitting || !!successMessage}
						class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-slate-900 py-3 font-bold text-white shadow-sm transition-all duration-300 ease-in-out hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400"
					>
						{#if isSubmitting}
							<span
								class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							<span>認証中...</span>
						{:else}
							<span>ログインする 🚀</span>
						{/if}
					</button>
				</form>
			{/if}

			<!-- 3. 新規スタッフ登録 -->
			{#if activeTab === 'register'}
				<form onsubmit={handleRegister} in:fade={{ duration: 250 }} class="space-y-4 text-xs">
					<div>
						<label for="reg-name" class="mb-1 block text-slate-400">氏名 (スタッフ表示用)</label>
						<input
							id="reg-name"
							type="text"
							bind:value={registerName}
							disabled={isSubmitting || !!successMessage}
							placeholder="例: 佐藤 (社員)"
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all duration-300 focus:border-slate-400 focus:bg-white focus:outline-none"
						/>
					</div>

					<div>
						<label for="reg-email" class="mb-1 block text-slate-400">メールアドレス</label>
						<input
							id="reg-email"
							type="email"
							bind:value={registerEmail}
							disabled={isSubmitting || !!successMessage}
							placeholder="email@example.com"
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all duration-300 focus:border-slate-400 focus:bg-white focus:outline-none"
						/>
					</div>

					<div>
						<label for="reg-pass" class="mb-1 block text-slate-400">パスワード</label>
						<input
							id="reg-pass"
							type="password"
							bind:value={registerPassword}
							disabled={isSubmitting || !!successMessage}
							placeholder="6文字以上"
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all duration-300 focus:border-slate-400 focus:bg-white focus:outline-none"
						/>
					</div>

					<div>
						<label for="reg-role" class="mb-1 block text-slate-400">契約・年齢区分</label>
						<select
							id="reg-role"
							bind:value={registerRole}
							disabled={isSubmitting || !!successMessage}
							class="w-full rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-slate-700 transition-all focus:border-slate-400 focus:bg-white focus:outline-none"
						>
							<option value="employee">社員 (通常管理者)</option>
							<option value="adult">成人 (アルバイト等)</option>
							<option value="minor">未成年 (18歳未満)</option>
						</select>
					</div>

					<button
						type="submit"
						disabled={isSubmitting || !!successMessage}
						class="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-full bg-indigo-600 py-3 font-bold text-white shadow-sm transition-all duration-300 ease-in-out hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400"
					>
						{#if isSubmitting}
							<span
								class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
							></span>
							<span>登録中...</span>
						{:else}
							<span>登録してログイン 🚀</span>
						{/if}
					</button>
				</form>
			{/if}
		</div>
	</div>
</div>

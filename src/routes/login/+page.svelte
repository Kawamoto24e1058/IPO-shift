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
      await authState.registerWithEmail(registerEmail, registerPassword, registerName, registerRole);
      successMessage = '新規登録が完了しました！';
    } catch (e: any) {
      errorMessage = e.message || '登録に失敗しました。';
    } finally {
      isSubmitting = false;
    }
  }
</script>

<div class="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col justify-center items-center p-4 relative overflow-hidden select-none">
  <!-- プレミアムなバックグラウンドグラデーション球体 -->
  <div class="absolute -top-40 -left-40 w-96 h-96 bg-indigo-200/40 rounded-full blur-3xl"></div>
  <div class="absolute -bottom-40 -right-40 w-96 h-96 bg-sky-200/30 rounded-full blur-3xl"></div>

  <div class="w-full max-w-md bg-white border border-slate-200/80 rounded-[32px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] backdrop-blur-md relative z-10 space-y-8 animate-in fade-in duration-500">
    <!-- アプリロゴ -->
    <div class="text-center space-y-2">
      <span class="text-[10px] bg-indigo-50 border border-indigo-100/80 text-indigo-600 font-bold px-3 py-1 rounded-full uppercase tracking-wider">
        🔐 IPO Shift Portal
      </span>
      <h1 class="text-3xl font-black text-slate-900 tracking-tight">
        ログイン
      </h1>
      <p class="text-xs text-slate-400 font-medium">シフト希望提出 ＆ 調整管理システム</p>
    </div>

    <!-- 通知・エラーメッセージ -->
    {#if errorMessage}
      <div transition:fade={{ duration: 200 }} class="bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl p-4 text-xs font-semibold leading-relaxed">
        ⚠️ {errorMessage}
      </div>
    {/if}

    {#if successMessage}
      <div transition:fade={{ duration: 200 }} class="bg-emerald-50 border border-emerald-100 text-emerald-600 rounded-2xl p-4 text-xs font-semibold text-center flex items-center justify-center gap-1.5 animate-pulse">
        <span>✨</span>
        <span>{successMessage}</span>
      </div>
    {/if}

    <!-- タブナビゲーション (Instagramカプセル風) -->
    <nav class="flex p-1 bg-slate-100 rounded-2xl border border-slate-200/50 shadow-inner">
      <button 
        type="button"
        onclick={() => { activeTab = 'login'; errorMessage = ''; }}
        class="flex-1 py-2 text-xs font-extrabold rounded-xl transition duration-300 flex items-center justify-center gap-1
          {activeTab === 'login' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800'}"
      >
        <span>✉️</span>
        <span>ログイン</span>
      </button>
      <button 
        type="button"
        onclick={() => { activeTab = 'register'; errorMessage = ''; }}
        class="flex-1 py-2 text-xs font-extrabold rounded-xl transition duration-300 flex items-center justify-center gap-1
          {activeTab === 'register' ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50' : 'text-slate-500 hover:text-slate-800'}"
      >
        <span>＋</span>
        <span>新規登録</span>
      </button>
    </nav>

    <!-- フォーム本体 -->
    <div class="min-h-[250px] flex flex-col justify-center">
      <!-- 2. 本番用メールアドレスログイン -->
      {#if activeTab === 'login'}
        <form onsubmit={handleEmailLogin} in:fade={{ duration: 250 }} class="space-y-5 text-xs">
          <div>
            <label for="login-email" class="text-slate-400 block mb-1">メールアドレス</label>
            <input 
              id="login-email"
              type="email" 
              bind:value={email} 
              disabled={isSubmitting || !!successMessage}
              placeholder="email@example.com"
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300"
            />
          </div>

          <div>
            <label for="login-pass" class="text-slate-400 block mb-1">パスワード</label>
            <input 
              id="login-pass"
              type="password" 
              bind:value={password} 
              disabled={isSubmitting || !!successMessage}
              placeholder="••••••••"
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300"
            />
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || !!successMessage}
            class="w-full bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-full transition-all duration-300 ease-in-out shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {#if isSubmitting}
              <span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
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
            <label for="reg-name" class="text-slate-400 block mb-1">氏名 (スタッフ表示用)</label>
            <input 
              id="reg-name"
              type="text" 
              bind:value={registerName} 
              disabled={isSubmitting || !!successMessage}
              placeholder="例: 佐藤 (社員)"
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300"
            />
          </div>

          <div>
            <label for="reg-email" class="text-slate-400 block mb-1">メールアドレス</label>
            <input 
              id="reg-email"
              type="email" 
              bind:value={registerEmail} 
              disabled={isSubmitting || !!successMessage}
              placeholder="email@example.com"
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300"
            />
          </div>

          <div>
            <label for="reg-pass" class="text-slate-400 block mb-1">パスワード</label>
            <input 
              id="reg-pass"
              type="password" 
              bind:value={registerPassword} 
              disabled={isSubmitting || !!successMessage}
              placeholder="6文字以上"
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all duration-300"
            />
          </div>

          <div>
            <label for="reg-role" class="text-slate-400 block mb-1">契約・年齢区分</label>
            <select 
              id="reg-role"
              bind:value={registerRole}
              disabled={isSubmitting || !!successMessage}
              class="w-full bg-slate-50 border border-slate-200 rounded-full px-4 py-2.5 text-slate-700 focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
            >
              <option value="employee">社員 (通常管理者)</option>
              <option value="adult">成人 (アルバイト等)</option>
              <option value="minor">未成年 (18歳未満)</option>
            </select>
          </div>

          <button 
            type="submit"
            disabled={isSubmitting || !!successMessage}
            class="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-full transition-all duration-300 ease-in-out shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {#if isSubmitting}
              <span class="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full"></span>
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


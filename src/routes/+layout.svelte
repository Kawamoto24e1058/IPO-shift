<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import './layout.css';
  import favicon from '$lib/assets/favicon.svg';
  import { page } from '$app/stores';
  import { authState } from '../lib/services/authService.svelte.ts';
  import { fade } from 'svelte/transition';

  let { children } = $props();

  // ルーティングガードの自動判定
  $effect(() => {
    if (!authState.loading) {
      const currentPath = $page.url.pathname;
      if (!authState.user && currentPath !== '/login') {
        // 未ログイン時のリダイレクト
        window.location.href = '/login';
      } else if (authState.user && currentPath === '/login') {
        // ログイン済みなのにログインページへ行った場合のダッシュボードリダイレクト
        window.location.href = '/';
      }
    }
  });
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
  <title>IPO Shift</title>
</svelte:head>

{#if authState.loading}
  <!-- プレミアムな読み込みアニメーション画面 -->
  <div transition:fade={{ duration: 150 }} class="fixed inset-0 bg-slate-50 flex flex-col justify-center items-center z-50 select-none">
    <div class="relative flex items-center justify-center">
      <div class="animate-spin rounded-full h-16 w-16 border-4 border-indigo-200 border-t-indigo-600"></div>
      <span class="absolute text-xs font-bold text-indigo-600 animate-pulse">IPO</span>
    </div>
    <span class="text-xs text-slate-400 font-bold tracking-wider mt-4 animate-pulse">ポータル認証中...</span>
  </div>
{:else}
  {@render children()}
{/if}

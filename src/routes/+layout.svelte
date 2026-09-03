<script lang="ts">
	import '../app.css';
	import { theme, toggleTheme } from '$lib/theme';

	let { children, data } = $props();
</script>

<header class="topbar">
	<div class="topbar-inner">
		<a class="brand" href="/">
			<svg class="brand-mark" viewBox="0 0 24 24" fill="none" aria-hidden="true">
				<path d="M12 12 L12 3 A9 9 0 0 1 21 12 Z" fill="currentColor" fill-opacity="0.28" />
				<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.5" />
				<circle cx="12" cy="12" r="5" stroke="currentColor" stroke-width="1" opacity="0.55" />
				<circle cx="12" cy="12" r="1.1" fill="currentColor" />
				<circle cx="18.36" cy="5.64" r="1.9" fill="currentColor" />
			</svg>
			RAD<span>AR</span>
		</a>
		<div class="spacer"></div>
		<button class="btn small theme-toggle" onclick={toggleTheme} title="Toggle dark mode" aria-label="Toggle dark mode">
			{#if $theme === 'dark'}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<circle cx="12" cy="12" r="5" />
					<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
				</svg>
			{:else}
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
				</svg>
			{/if}
		</button>
		{#if data.user}
			<span class="user-chip">{data.user.name}</span>
			<a class="btn small" href="/auth/logout">Log out</a>
		{:else}
			<a class="btn small" href="/auth/login">Sign in</a>
		{/if}
	</div>
</header>

<main>
	{@render children()}
</main>

<style>
	.theme-toggle {
		width: 32px;
		height: 32px;
		padding: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}
	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}
	.brand {
		display: inline-flex;
		align-items: center;
		gap: 8px;
	}
	.brand-mark {
		width: 22px;
		height: 22px;
		color: var(--accent);
	}
</style>

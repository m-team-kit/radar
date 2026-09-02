<script lang="ts">
	import '../app.css';

	let { children, data } = $props();
</script>

<header class="topbar">
	<div class="topbar-inner">
		<a class="brand" href="/">RA<span>DAR</span></a>
		<div class="spacer"></div>
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

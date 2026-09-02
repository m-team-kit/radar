<script lang="ts">
	import { page } from '$app/state';

	const message = $derived(page.url.searchParams.get('message') ?? 'Something went wrong while signing you in.');
</script>

<div class="card auth-error">
	<h1>Sign-in failed</h1>
	<p class="message">{message}</p>
	<p class="hint">
		Check the server logs for the full error from your identity provider, then try again.
	</p>
	<a class="btn primary" href="/auth/login">Try again</a>
</div>

<style>
	.auth-error {
		max-width: 520px;
		margin: 64px auto;
		padding: 28px;
		text-align: center;
	}
	.message {
		color: var(--bad);
		background: var(--bad-soft);
		border: 1px solid #f3caca;
		border-radius: 8px;
		padding: 12px;
		font-size: 14px;
		word-break: break-word;
	}
</style>

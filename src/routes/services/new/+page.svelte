<script lang="ts">
	import { goto } from '$app/navigation';
	import LogoPicker from '$lib/components/LogoPicker.svelte';
	import { api } from '$lib/api';

	let name = $state('');
	let description = $state('');
	let logoUrl = $state('');
	let selectedFile: File | null = $state(null);
	let errorMsg = $state('');
	let saving = $state(false);

	async function create() {
		if (!name.trim() || saving) return;
		errorMsg = '';
		saving = true;
		try {
			const svc = (await api(`/api/services`, {
				method: 'POST',
				body: JSON.stringify({ name: name.trim(), description: description.trim(), logo_url: logoUrl.trim() || null })
			})) as { id: string };
			if (selectedFile) {
				const form = new FormData();
				form.append('logo', selectedFile);
				await api(`/api/services/${svc.id}/logo`, { method: 'POST', body: form });
			}
			await goto(`/services/${svc.id}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			saving = false;
		}
	}
</script>

<h1>New service</h1>
<p class="subtitle">A service groups release sources and their deployments.</p>

<div class="card form-card">
	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}
	<div class="field">
		<label for="new-name">Name <input id="new-name" bind:value={name} placeholder="e.g. auth-api" /></label>
	</div>
	<div class="field">
		<label for="new-desc">Description <textarea id="new-desc" bind:value={description} placeholder="Optional — what this service does"></textarea></label>
	</div>
	<div class="form-actions">
		<button class="btn primary" onclick={create} disabled={saving || !name.trim()}>Create</button>
		<a class="btn" href="/">Cancel</a>
	</div>
</div>

<div class="card form-card" style="margin-top:20px">
	<h2 class="block-title">Logo</h2>
	<p class="hint">Optional — set it by URL or upload an image (PNG, JPEG, WebP, max 2 MB).</p>
	<LogoPicker bind:logoUrl={logoUrl} onFile={(f) => (selectedFile = f)} />
</div>

<style>
	.form-card {
		padding: 20px;
		max-width: 560px;
	}
	.block-title {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--muted);
		margin: 0 0 4px;
	}
</style>

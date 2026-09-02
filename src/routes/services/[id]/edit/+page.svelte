<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import ShareEditor from '$lib/components/ShareEditor.svelte';
	import LogoPicker from '$lib/components/LogoPicker.svelte';
	import { api } from '$lib/api';

	let { data } = $props();

	let name = $state(initialName());
	let description = $state(initialDescription());
	let logoUrl = $state(initialLogoUrl());
	let errorMsg = $state('');
	let saving = $state(false);
	let logoError = $state('');
	let logoBusy = $state(false);

	function initialName(): string {
		return data.service.name;
	}
	function initialDescription(): string {
		return data.service.description;
	}
	function initialLogoUrl(): string {
		return data.service.logo_url ?? '';
	}

	async function save() {
		if (!name.trim() || saving) return;
		errorMsg = '';
		saving = true;
		try {
			await api(`/api/services/${data.service.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ name: name.trim(), description: description.trim(), logo_url: logoUrl.trim() || null })
			});
			await goto(`/services/${data.service.id}`);
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			saving = false;
		}
	}

	async function uploadLogo(file: File) {
		if (logoBusy) return;
		logoBusy = true;
		logoError = '';
		const form = new FormData();
		form.append('logo', file);
		try {
			await api(`/api/services/${data.service.id}/logo`, { method: 'POST', body: form });
			logoUrl = '';
			await invalidateAll();
		} catch (e) {
			logoError = e instanceof Error ? e.message : String(e);
		} finally {
			logoBusy = false;
		}
	}

	async function removeLogo() {
		if (logoBusy) return;
		logoBusy = true;
		logoError = '';
		try {
			await api(`/api/services/${data.service.id}/logo`, { method: 'DELETE' });
			logoUrl = '';
			await invalidateAll();
		} catch (e) {
			logoError = e instanceof Error ? e.message : String(e);
		} finally {
			logoBusy = false;
		}
	}
</script>

<h1>Edit service</h1>

<div class="card form-card">
	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}
	<div class="field">
		<label for="svc-name">Name <input id="svc-name" bind:value={name} /></label>
	</div>
	<div class="field">
		<label for="svc-desc">Description <textarea id="svc-desc" bind:value={description}></textarea></label>
	</div>
	<div class="form-actions">
		<button class="btn primary" onclick={save} disabled={saving || !name.trim()}>Save</button>
		<a class="btn" href="/services/{data.service.id}">Cancel</a>
	</div>
</div>

<div class="card form-card" style="margin-top:20px">
	<h2 class="block-title">Logo</h2>
	<p class="hint">Set a logo by URL or by uploading an image (PNG, JPEG, WebP, max 2 MB).</p>

	{#if logoError}
		<div class="error">{logoError}</div>
	{/if}

	<LogoPicker
		bind:logoUrl={logoUrl}
		uploadedSrc={data.service.has_logo ? `/api/services/${data.service.id}/logo` : ''}
		onFile={(f) => void uploadLogo(f)}
	>
		{#if data.service.has_logo || logoUrl.trim()}
			<div class="row">
				<button class="btn small danger" onclick={removeLogo} disabled={logoBusy}>Remove</button>
			</div>
		{/if}
	</LogoPicker>

	<p class="hint">URL changes are saved with the "Save" button above.</p>
</div>

<div class="card form-card" style="margin-top:20px">
	<h2 class="block-title">Sharing</h2>
	<p class="hint">Share this service with OIDC groups. Editors can modify it; viewers can only watch.</p>
	<ShareEditor serviceId={data.service.id} />
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

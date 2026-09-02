<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		logoUrl = $bindable(''),
		uploadedSrc = '',
		onFile,
		children
	}: {
		logoUrl?: string;
		uploadedSrc?: string;
		onFile?: (file: File) => void;
		children?: Snippet;
	} = $props();

	let fileInput: HTMLInputElement;

	const preview = $derived(logoUrl.trim() || uploadedSrc);

	function handleFile() {
		const file = fileInput?.files?.[0];
		if (file) onFile?.(file);
		if (fileInput) fileInput.value = '';
	}
</script>

<div class="logo-row">
	<div class="logo-preview">
		{#if preview}
			<img src={preview} alt="Service logo" />
		{:else}
			<span class="logo-placeholder">No logo</span>
		{/if}
	</div>
	<div class="logo-actions">
		<label for="logo-url-input">Logo URL
			<input id="logo-url-input" bind:value={logoUrl} placeholder="https://example.com/logo.png" />
		</label>
		<input type="file" accept="image/png,image/jpeg,image/webp" bind:this={fileInput} onchange={handleFile} />
		{#if children}
			{@render children()}
		{/if}
	</div>
</div>

<style>
	.logo-row {
		display: flex;
		gap: 16px;
		align-items: flex-start;
	}
	.logo-preview {
		width: 80px;
		height: 80px;
		border: 1px solid var(--border);
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		background: #f2f4f7;
		flex-shrink: 0;
	}
	.logo-preview img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.logo-placeholder {
		color: var(--muted);
		font-size: 12px;
	}
	.logo-actions {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
</style>

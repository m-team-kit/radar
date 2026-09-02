<script lang="ts">
	import { onMount } from 'svelte';
	import { api } from '$lib/api';
	import type { ServiceShareRow, ShareRole } from '$lib/types';

	let { serviceId }: { serviceId: string } = $props();

	let shares: ServiceShareRow[] = $state([]);
	let newGroup = $state('');
	let newRole: ShareRole = $state('viewer');
	let saving = $state(false);
	let errorMsg = $state('');

	async function load() {
		shares = await api<ServiceShareRow[]>(`/api/services/${serviceId}/shares`);
	}

	async function save(next: ServiceShareRow[]) {
		saving = true;
		errorMsg = '';
		try {
			await api(`/api/services/${serviceId}/shares`, {
				method: 'PUT',
				body: JSON.stringify({ shares: next.map((s) => ({ group_name: s.group_name, role: s.role })) })
			});
			shares = next;
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function addShare() {
		const group = newGroup.trim();
		if (!group || saving) return;
		void save([...shares, { service_id: serviceId, group_name: group, role: newRole }]);
		newGroup = '';
	}

	function removeShare(group: string) {
		void save(shares.filter((s) => s.group_name !== group));
	}

	onMount(() => {
		void load();
	});
</script>

<div class="share-editor">
	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}

	{#if shares.length > 0}
		<div class="share-list">
			{#each shares as share (share.group_name)}
				<div class="share-row">
					<span class="tag gray">{share.group_name}</span>
					<span class="share-role">{share.role}</span>
					<button class="btn small danger" onclick={() => removeShare(share.group_name)} disabled={saving}>Remove</button>
				</div>
			{/each}
		</div>
	{:else}
		<p class="hint">Not shared yet. Only you can see this service.</p>
	{/if}

	<div class="share-add">
		<input placeholder="Group name" bind:value={newGroup} />
		<select bind:value={newRole}>
			<option value="viewer">viewer</option>
			<option value="editor">editor</option>
		</select>
		<button class="btn small" onclick={addShare} disabled={saving || !newGroup.trim()}>Add</button>
	</div>
</div>

<style>
	.share-editor {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.share-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.share-row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 10px;
		border: 1px solid var(--border);
		border-radius: 8px;
	}
	.share-role {
		flex: 1;
		font-size: 13px;
		color: var(--muted);
	}
	.share-add {
		display: flex;
		gap: 8px;
	}
	.share-add input {
		flex: 1;
	}
</style>

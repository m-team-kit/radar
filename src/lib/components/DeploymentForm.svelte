<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { DeploymentQuery, DeploymentView, ReleaseSourceView } from '$lib/types';

	let {
		serviceId,
		sources,
		deployment,
		defaultInterval
	}: {
		serviceId: string;
		sources: ReleaseSourceView[];
		deployment?: DeploymentView;
		defaultInterval: number;
	} = $props();

	type QueryType = 'http' | 'http_json' | 'http_jwt' | 'manual';

	let name = $state(initialName());
	let releaseSourceId = $state(initialSourceId());
	let qtype = $state<QueryType>(initialQueryType());
	let qurl = $state(initialQueryUrl());
	let qfield = $state(initialQueryField());
	let pollInterval = $state(initialPollInterval());
	let notifyEnabled = $state(initialNotifyEnabled());
	let notifyEmails = $state(initialNotifyEmails());
	let notifyGroups = $state(initialNotifyGroups());
	let notifyWebhook = $state(initialNotifyWebhook());
	let errorMsg = $state('');
	let saving = $state(false);

	function initialName(): string {
		return deployment?.name ?? '';
	}
	function initialSourceId(): string {
		return deployment?.release_source_id ?? '';
	}
	function initialQueryType(): QueryType {
		return deployment?.query.type ?? 'http';
	}
	function initialQueryUrl(): string {
		const q = deployment?.query;
		return q?.type === 'http' || q?.type === 'http_json' || q?.type === 'http_jwt' ? q.url : '';
	}
	function initialQueryField(): string {
		const q = deployment?.query;
		return q?.type === 'http_json' || q?.type === 'http_jwt' ? q.field : '';
	}
	function initialPollInterval(): number {
		return deployment?.poll_interval_s ?? defaultInterval;
	}
	function initialNotifyEnabled(): boolean {
		return deployment?.notify_enabled ?? false;
	}
	function initialNotifyEmails(): string {
		return deployment?.notify_emails_list.join(', ') ?? '';
	}
	function initialNotifyGroups(): string {
		return deployment?.notify_groups_list.join(', ') ?? '';
	}
	function initialNotifyWebhook(): string {
		return deployment?.notify_webhook ?? '';
	}

	function submit() {
		if (saving) return;
		if (!name.trim()) {
			errorMsg = 'Name is required';
			return;
		}
		errorMsg = '';
		saving = true;
		let query: DeploymentQuery;
		if (qtype === 'http') query = { type: 'http', url: qurl.trim() };
		else if (qtype === 'http_json') query = { type: 'http_json', url: qurl.trim(), field: qfield.trim() };
		else if (qtype === 'http_jwt') query = { type: 'http_jwt', url: qurl.trim(), field: qfield.trim() };
		else query = { type: 'manual' };

		const payload = {
			name: name.trim(),
			release_source_id: releaseSourceId || null,
			query,
			poll_interval_s: pollInterval,
			notify_enabled: notifyEnabled,
			notify_emails: notifyEmails.split(',').map((e) => e.trim()).filter(Boolean),
			notify_groups: notifyGroups.split(',').map((g) => g.trim()).filter(Boolean),
			notify_webhook: notifyWebhook.trim()
		};

		const path = deployment ? `/api/deployments/${deployment.id}` : `/api/services/${serviceId}/deployments`;
		void api(path, { method: deployment ? 'PATCH' : 'POST', body: JSON.stringify(payload) })
			.then(() => goto(`/services/${serviceId}`))
			.catch((e: unknown) => {
				errorMsg = e instanceof Error ? e.message : String(e);
				saving = false;
			});
	}
</script>

<div class="card form-card">
	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}

	<div class="row">
		<div class="field">
			<label for="df-name">Name <input id="df-name" bind:value={name} placeholder="e.g. production" /></label>
		</div>
		<div class="field">
			<label for="df-source">Release source
				<select id="df-source" bind:value={releaseSourceId}>
					<option value="">None</option>
					{#each sources as source (source.id)}
						<option value={source.id}>{source.name}</option>
					{/each}
				</select>
			</label>
		</div>
	</div>

	<div class="field">
		<label for="df-qtype">Version source
			<select id="df-qtype" bind:value={qtype}>
				<option value="http">HTTP endpoint (body = version)</option>
				<option value="http_json">HTTP endpoint (JSON field)</option>
				<option value="http_jwt">HTTP endpoint (JWT claim)</option>
				<option value="manual">Manual / self-reported</option>
			</select>
		</label>
	</div>

	{#if qtype !== 'manual'}
		<div class="field">
			<label for="df-url">Endpoint URL <input id="df-url" bind:value={qurl} placeholder="https://example.com/version" /></label>
		</div>
		{#if qtype === 'http_json' || qtype === 'http_jwt'}
			<div class="field">
				<label for="df-field">{qtype === 'http_json' ? 'JSON field (dotted path)' : 'JWT claim (dotted path)'} <input id="df-field" bind:value={qfield} placeholder="data.version" /></label>
			</div>
		{/if}
	{:else}
		<p class="hint">Version is set by calling a secret report URL (shown after save) or from the UI.</p>
	{/if}

	<div class="field">
		<label for="df-poll">Poll interval (seconds) <input id="df-poll" type="number" bind:value={pollInterval} min="60" /></label>
	</div>

	<div class="field checkbox">
		<input type="checkbox" id="notify" bind:checked={notifyEnabled} />
		<label for="notify">Notify on pending updates</label>
	</div>

	{#if notifyEnabled}
		<div class="field">
			<label for="df-emails">Notification emails (comma separated) <input id="df-emails" bind:value={notifyEmails} placeholder="dev@example.com, ops@example.com" /></label>
		</div>
		<div class="field">
			<label for="df-groups">Notification groups (comma separated) <input id="df-groups" bind:value={notifyGroups} placeholder="my-group" /></label>
			<p class="hint">Members are resolved from their OIDC profile email.</p>
		</div>
		<div class="field">
			<label for="df-webhook">Webhook URL (POST) <input id="df-webhook" bind:value={notifyWebhook} placeholder="https://hooks.example.com/radar" /></label>
		</div>
	{/if}

	<div class="form-actions">
		<button class="btn primary" onclick={submit} disabled={saving}>{deployment ? 'Save' : 'Create'}</button>
		<a class="btn" href="/services/{serviceId}">Cancel</a>
	</div>
</div>

<style>
	.form-card {
		padding: 20px;
		max-width: 640px;
	}
</style>

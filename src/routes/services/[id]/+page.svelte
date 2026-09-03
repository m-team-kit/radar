<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import ShareEditor from '$lib/components/ShareEditor.svelte';
	import HistoryChart, { type ChartSeries } from '$lib/components/HistoryChart.svelte';
	import { api } from '$lib/api';
	import { timeAgo } from '$lib/format';
	import type { DeploymentView, ReleaseSourceView, ServiceView } from '$lib/types';

	let { data } = $props();

	const service = $derived(data.service as ServiceView);
	const isEditor = $derived(service.role === 'editor');

	// Refresh pages periodically so background poller updates appear on their own.
	const AUTO_REFRESH_MS = 15000;
	$effect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) void invalidateAll();
		}, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	});

	let refreshing = $state<string | null>(null);

	async function refreshSource(source: ReleaseSourceView) {
		if (refreshing) return;
		refreshing = source.id;
		try {
			await api(`/api/sources/${source.id}/refresh`, { method: 'POST' });
			await invalidateAll();
		} finally {
			refreshing = null;
		}
	}

	async function refreshDeployment(deployment: DeploymentView) {
		if (refreshing) return;
		refreshing = deployment.id;
		try {
			await api(`/api/deployments/${deployment.id}/refresh`, { method: 'POST' });
			await invalidateAll();
		} finally {
			refreshing = null;
		}
	}

	async function removeSource(source: ReleaseSourceView) {
		if (!confirm(`Delete source "${source.name}"?`)) return;
		await api(`/api/sources/${source.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function removeDeployment(deployment: DeploymentView) {
		if (!confirm(`Delete deployment "${deployment.name}"?`)) return;
		await api(`/api/deployments/${deployment.id}`, { method: 'DELETE' });
		await invalidateAll();
	}

	async function removeService() {
		if (!confirm(`Delete service "${service.name}"? This cannot be undone.`)) return;
		await api(`/api/services/${service.id}`, { method: 'DELETE' });
		await goto('/');
	}

	let copied = $state('');
	async function copyText(text: string) {
		await navigator.clipboard.writeText(text);
		copied = text;
		setTimeout(() => (copied = ''), 1500);
	}

	function reportUrl(deployment: DeploymentView): string | null {
		if (!deployment.report_token) return null;
		return new URL(`/api/deployments/${deployment.id}/report/${deployment.report_token}`, data.base_url).toString();
	}

	const chartSeries: ChartSeries[] = $derived([
		...data.history.sources.map((s) => ({
			id: s.id,
			name: `source: ${s.name}`,
			kind: s.kind,
			filterAliases: s.full_versions_only,
			points: s.history.map((h) => ({ t: h.first_seen_at, v: h.version }))
		})),
		...data.history.deployments.map((d) => ({
			id: d.id,
			name: `deploy: ${d.name}`,
			kind: d.kind,
			filterAliases: d.full_versions_only,
			points: d.history.map((h) => ({ t: h.observed_at, v: h.version }))
		}))
	])

	const hasHistory = $derived(chartSeries.some((s) => s.points.length > 0));

	function querySummary(d: DeploymentView): string {
		switch (d.query.type) {
			case 'http':
				return `GET ${d.query.url}`;
			case 'http_json':
				return `GET ${d.query.url} → ${d.query.field}`;
			case 'http_jwt':
				return `GET ${d.query.url} → JWT.${d.query.field}`;
			case 'manual':
				return 'manual / self-reported';
		}
	}
</script>

<div class="page-head">
	{#if service.logo_url || service.has_logo}
		<img class="service-logo" src={service.logo_url || `/api/services/${service.id}/logo`} alt="" />
	{/if}
	<div>
		<h1>{service.name}</h1>
		{#if service.description}
			<p class="subtitle" style="margin:2px 0 0">{service.description}</p>
		{/if}
	</div>
	{#if isEditor}
		<a class="btn" href="/services/{service.id}/edit">Edit</a>
		<button class="btn danger" onclick={removeService}>Delete</button>
	{/if}
</div>

<div class="content-grid" class:no-chart={!hasHistory}>
	{#if hasHistory}
		<div class="card chart-panel" style="padding:16px">
			<h2 class="section-title">History</h2>
			<HistoryChart series={chartSeries} height={320} />
		</div>
	{/if}

	<div class="two-col">
	<section>
		<div class="section-head">
			<h2 class="section-title">Release sources</h2>
			{#if isEditor}
				<a class="btn small primary" href="/services/{service.id}/sources/new">+ Add</a>
			{/if}
		</div>

		{#if service.sources.length === 0}
			<div class="card empty" style="padding:24px">No release sources.</div>
		{:else}
			{#each service.sources as source (source.id)}
				<div class="card item">
					<div class="item-main">
						<div class="item-title">
							{source.name}
							<span class="tag gray">{source.type}</span>
							{#if source.include_prereleases}
								<span class="tag blue">prereleases</span>
							{/if}
						</div>
						<div class="item-versions">
							<span class="mono latest">{(source.latest_version ?? '—')}</span>
							<span class="grayed">checked {timeAgo(source.last_checked_at)}</span>
						</div>
						{#if source.last_error}
							<div class="item-error">{source.last_error}</div>
						{/if}
					</div>
					{#if isEditor}
						<div class="item-actions">
							<button class="btn small" onclick={() => refreshSource(source)} disabled={refreshing !== null}>
								{refreshing === source.id ? 'Refreshing…' : 'Refresh'}
							</button>
							<a class="btn small" href="/services/{service.id}/sources/{source.id}/edit">Edit</a>
							<button class="btn small danger" onclick={() => removeSource(source)}>Delete</button>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</section>

	<section>
		<div class="section-head">
			<h2 class="section-title">Deployments</h2>
			{#if isEditor}
				<a class="btn small primary" href="/services/{service.id}/deployments/new">+ Add</a>
			{/if}
		</div>

		{#if service.deployments.length === 0}
			<div class="card empty" style="padding:24px">No deployments.</div>
		{:else}
			{#each service.deployments as deployment (deployment.id)}
				<div class="card item">
					<div class="item-main">
						<div class="item-title">
							{deployment.name}
							<StatusBadge {deployment} />
						</div>
						<div class="item-versions">
							<span class="mono latest">{(deployment.current_version ?? '—')}</span>
							<span class="grayed">last change {timeAgo(deployment.last_change_at)}</span>
						</div>
						<div class="grayed query-summary">{querySummary(deployment)}</div>
						{#if deployment.last_error}
							<div class="item-error">{deployment.last_error}</div>
						{/if}
						{#if reportUrl(deployment)}
							<div class="report-url">
								<span class="mono" title="Secret report URL">{reportUrl(deployment)}</span>
								<button class="btn small" onclick={() => copyText(reportUrl(deployment)!)}>
									{copied === reportUrl(deployment) ? 'Copied' : 'Copy'}
								</button>
							</div>
						{/if}
						{#if deployment.notify_enabled}
							<div class="grayed" style="font-size:12px">
								notifications on · {deployment.notify_emails_list.join(', ') || 'no emails'}
								{#if deployment.notify_groups_list.length > 0} · groups: {deployment.notify_groups_list.join(', ')}{/if}
								{#if deployment.notify_webhook} · webhook{/if}
							</div>
						{/if}
					</div>
					{#if isEditor}
						<div class="item-actions">
							{#if deployment.query.type !== 'manual'}
								<button class="btn small" onclick={() => refreshDeployment(deployment)} disabled={refreshing !== null}>
									{refreshing === deployment.id ? 'Refreshing…' : 'Refresh'}
								</button>
							{/if}
							<a class="btn small" href="/services/{service.id}/deployments/{deployment.id}/edit">Edit</a>
							<button class="btn small danger" onclick={() => removeDeployment(deployment)}>Delete</button>
						</div>
					{/if}
				</div>
			{/each}
		{/if}
	</section>
</div>

	{#if isEditor}
		<section class="share-panel">
			<div class="section-head">
				<h2 class="section-title">Sharing</h2>
			</div>
			<div class="card" style="padding:16px">
				<ShareEditor serviceId={service.id} />
			</div>
		</section>
	{/if}
</div>

<style>
	.service-logo {
		width: 40px;
		height: 40px;
		object-fit: contain;
		border-radius: 8px;
		flex-shrink: 0;
	}
	.content-grid {
		display: grid;
		gap: 24px;
	}
	@media (min-width: 1600px) {
		.content-grid {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
			align-items: start;
		}
		.content-grid.no-chart {
			grid-template-columns: 1fr;
		}
		.two-col {
			grid-column: 1;
			grid-row: 1;
		}
		.share-panel {
			grid-column: 1;
			grid-row: 2;
		}
		.chart-panel {
			grid-column: 2;
			grid-row: 1 / span 2;
			position: sticky;
			top: 72px;
			min-width: 0;
		}
	}
	.two-col {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 24px;
		align-items: start;
	}
	@media (max-width: 860px) {
		.two-col {
			grid-template-columns: 1fr;
		}
	}
	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 10px;
	}
	.section-title {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--muted);
		margin: 0;
	}
	.item {
		padding: 14px;
		margin-bottom: 10px;
		display: flex;
		gap: 12px;
		align-items: flex-start;
	}
	.item-main {
		flex: 1;
		min-width: 0;
	}
	.item-title {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		font-size: 14px;
		margin-bottom: 6px;
	}
	.item-versions {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 2px;
	}
	.latest {
		font-weight: 600;
		font-size: 15px;
	}
	.grayed {
		color: var(--muted);
		font-size: 12px;
	}
	.query-summary {
		font-family: 'SF Mono', ui-monospace, Menlo, monospace;
		font-size: 12px;
		margin-top: 2px;
		overflow-wrap: anywhere;
	}
	.item-error {
		color: var(--bad);
		font-size: 12px;
		margin-top: 6px;
		background: var(--bad-soft);
		border-radius: 6px;
		padding: 4px 8px;
	}
	.item-actions {
		display: flex;
		flex-direction: column;
		gap: 6px;
		flex-shrink: 0;
	}
	.report-url {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		padding: 6px 8px;
		background: var(--subtle);
		border-radius: 6px;
	}
	.report-url .mono {
		flex: 1;
		font-size: 11px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>

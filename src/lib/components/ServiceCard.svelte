<script lang="ts">
	import type { ServiceView } from '$lib/types';
	import StatusBadge from './StatusBadge.svelte';
	import { timeAgo } from '$lib/format';

	let { service }: { service: ServiceView } = $props();

	const logoSrc = $derived(service.logo_url || (service.has_logo ? `/api/services/${service.id}/logo` : ''));

	function latestCheck(service: ServiceView): string | null {
		const stamps = [
			...service.sources.map((s) => s.last_checked_at),
			...service.deployments.map((d) => d.last_check_at)
		].filter((x): x is string => Boolean(x));
		if (stamps.length === 0) return null;
		return stamps.reduce((a, b) => (a > b ? a : b));
	}
</script>

<a class="card service-card" href="/services/{service.id}">
	<div class="sc-head">
		{#if logoSrc}
			<img class="sc-logo" src={logoSrc} alt="" />
		{/if}
		<span class="sc-title">{service.name}</span>
		{#if service.role === 'editor'}
			<span class="tag blue">editor</span>
		{/if}
	</div>
	{#if service.description}
		<p class="sc-desc">{service.description}</p>
	{/if}

	{#if service.sources.length > 0}
		<div class="sc-block">
			<div class="sc-label">Releases</div>
			{#each service.sources as source (source.id)}
				<div class="sc-row">
					<span class="sc-name" title="{source.type} source">{source.name}</span>
					<span class="mono sc-version">{source.latest_version ?? '—'}</span>
				</div>
			{/each}
		</div>
	{/if}

	{#if service.deployments.length > 0}
		<div class="sc-block">
			<div class="sc-label">Deployments</div>
			{#each service.deployments as deployment (deployment.id)}
				<div class="sc-row">
					<span class="sc-name">{deployment.name}</span>
					<span class="mono sc-version" title="deployed version">{deployment.current_version ?? '—'}</span>
					<StatusBadge {deployment} />
				</div>
			{/each}
		</div>
	{/if}

	<div class="sc-foot">
		<span>{service.sources.length} source{service.sources.length === 1 ? '' : 's'}</span>
		<span>{service.deployments.length} deployment{service.deployments.length === 1 ? '' : 's'}</span>
		<span class="spacer"></span>
		{#if service.deployments.length > 0}
			<span class="grayed">last check {timeAgo(latestCheck(service))}</span>
		{/if}
	</div>
</a>

<style>
	.service-card {
		display: block;
		color: var(--text);
		padding: 16px;
		transition: border-color 0.12s ease, box-shadow 0.12s ease;
	}
	.service-card:hover {
		text-decoration: none;
		border-color: var(--hover-border);
		box-shadow: var(--shadow-hover);
	}
	.sc-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.sc-logo {
		width: 24px;
		height: 24px;
		object-fit: contain;
		border-radius: 4px;
		flex-shrink: 0;
	}
	.sc-title {
		font-size: 16px;
		font-weight: 650;
	}
	.sc-desc {
		margin: 4px 0 12px;
		color: var(--muted);
		font-size: 13px;
	}
	.sc-block {
		margin-top: 10px;
	}
	.sc-label {
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.6px;
		color: var(--muted);
		margin-bottom: 4px;
	}
	.sc-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 3px 0;
		font-size: 13px;
	}
	.sc-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.sc-version {
		color: var(--text);
		font-weight: 550;
		white-space: nowrap;
	}
	.sc-foot {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-top: 14px;
		padding-top: 10px;
		border-top: 1px solid var(--border);
		font-size: 12px;
		color: var(--muted);
	}
	.sc-foot .spacer {
		flex: 1;
	}
	.grayed {
		color: var(--muted);
	}
</style>

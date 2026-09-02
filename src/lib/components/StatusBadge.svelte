<script lang="ts">
	import type { DeploymentView } from '$lib/types';

	let { deployment }: { deployment: DeploymentView } = $props();

	const lag = $derived(deployment.lag);
	const hasSource = $derived(deployment.release_source_id !== null);
	const behind = $derived(lag?.behind);
</script>

{#if !hasSource}
	<span class="tag gray">manual</span>
{:else if !deployment.current_version}
	<span class="tag gray">unknown</span>
{:else if behind == null}
	<span class="tag gray" title="deployed {deployment.current_version} · latest {lag?.latest}">unknown</span>
{:else if behind > 0}
	<span class="tag warn" title="deployed {deployment.current_version} · latest {lag?.latest}">
		{behind} behind
	</span>
{:else if lag?.ahead}
	<span class="tag blue" title="deployed {deployment.current_version} · latest {lag?.latest}">ahead</span>
{:else}
	<span class="tag ok" title="deployed {deployment.current_version} · latest {lag?.latest}">up to date</span>
{/if}

<style>
	.tag.warn {
		background: var(--warn-soft);
		color: var(--warn);
	}
	.tag.ok {
		background: var(--ok-soft);
		color: var(--ok);
	}
	.tag.blue {
		background: var(--accent-soft);
		color: var(--accent);
	}
</style>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ServiceCard from '$lib/components/ServiceCard.svelte';

	let { data } = $props();

	// Refresh periodically so background poller updates appear on their own.
	const AUTO_REFRESH_MS = 15000;
	$effect(() => {
		const timer = setInterval(() => {
			if (!document.hidden) void invalidateAll();
		}, AUTO_REFRESH_MS);
		return () => clearInterval(timer);
	});
</script>

<div class="page-head">
	<h1>Services</h1>
	<a class="btn primary" href="/services/new">+ New service</a>
</div>

{#if data.services.length === 0}
	<div class="empty">
		<p>No services yet.</p>
		<p style="font-size:13px;color:var(--muted)">Create a service, add its release sources, then track where it is deployed.</p>
	</div>
{:else}
	<div class="grid">
		{#each data.services as service (service.id)}
			<ServiceCard {service} />
		{/each}
	</div>
{/if}

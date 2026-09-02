<script lang="ts">
	import DeploymentForm from '$lib/components/DeploymentForm.svelte';

	let { data } = $props();
</script>

<h1>Add deployment</h1>
<p class="subtitle">For service “{data.service.name}”</p>

<DeploymentForm serviceId={data.service.id} sources={data.sources} defaultInterval={data.default_interval} />

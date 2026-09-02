<script lang="ts">
	import DeploymentForm from '$lib/components/DeploymentForm.svelte';

	let { data } = $props();
</script>

<h1>Edit deployment</h1>
<p class="subtitle">For service “{data.service.name}”</p>

<DeploymentForm serviceId={data.service.id} sources={data.sources} deployment={data.deployment} defaultInterval={data.default_interval} />

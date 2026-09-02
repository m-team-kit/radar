<script lang="ts">
	import SourceForm from '$lib/components/SourceForm.svelte';

	let { data } = $props();
</script>

<h1>Add release source</h1>
<p class="subtitle">For service “{data.service.name}”</p>

<SourceForm serviceId={data.service.id} defaultInterval={data.default_interval} />

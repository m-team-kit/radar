<script lang="ts">
	import { goto } from '$app/navigation';
	import { api } from '$lib/api';
	import type { ReleaseSourceView, SourceConfig, SourceType } from '$lib/types';

	let { serviceId, source, defaultInterval }: { serviceId: string; source?: ReleaseSourceView; defaultInterval: number } = $props();

	const TYPE_LABELS: Record<SourceType, string> = {
		docker: 'Docker image',
		github: 'GitHub releases',
		pypi: 'PyPI package',
		npm: 'npm package',
		apt: 'apt (Debian) package',
		url: 'Generic URL'
	};

	let name = $state(initialName());
	let type = $state<SourceType>(initialType());
	let includePrereleases = $state(initialPrereleases());
	let fullVersionsOnly = $state(initialFullVersionsOnly());
	let pollInterval = $state(initialPollInterval());
	let errorMsg = $state('');
	let saving = $state(false);

	function initialName(): string {
		return source?.name ?? '';
	}
	function initialType(): SourceType {
		return source?.type ?? 'docker';
	}
	function initialPrereleases(): boolean {
		return source?.include_prereleases ?? false;
	}
	function initialFullVersionsOnly(): boolean {
		return source?.full_versions_only ?? true;
	}
	function initialPollInterval(): number {
		return source?.poll_interval_s ?? defaultInterval;
	}

	let cfg = $state<Record<string, string>>(initialCfg());

	function initialCfg(): Record<string, string> {
		if (!source) return {};
		const c = source.parsed_config as unknown as Record<string, unknown>;
		const out: Record<string, string> = {};
		for (const [k, v] of Object.entries(c)) {
			if (k === 'type') continue;
			if (typeof v === 'string') out[k] = v;
			else if (typeof v === 'boolean') out[k] = String(v);
		}
		return out;
	}

	$effect(() => {
		if (type === 'url' && cfg.kind === undefined) cfg.kind = 'text';
	});

	function submit() {
		if (saving) return;
		errorMsg = '';
		saving = true;
		const config = buildConfig();
		if (!config) {
			saving = false;
			return;
		}
		const path = source ? `/api/sources/${source.id}` : `/api/services/${serviceId}/sources`;
		const method = source ? 'PATCH' : 'POST';
		void api(path, {
			method,
			body: JSON.stringify({
				name,
				type,
				config,
				include_prereleases: includePrereleases,
				full_versions_only: fullVersionsOnly,
				poll_interval_s: pollInterval
			})
		})
			.then(() => goto(`/services/${serviceId}`))
			.catch((e: unknown) => {
				errorMsg = e instanceof Error ? e.message : String(e);
				saving = false;
			});
	}

	function buildConfig(): SourceConfig | null {
		try {
			switch (type) {
				case 'docker':
					return { type, repository: req(cfg.repository, 'Repository'), registry: opt(cfg.registry), tagFilter: opt(cfg.tagFilter) };
				case 'github':
					return { type, owner: req(cfg.owner, 'Owner'), repo: req(cfg.repo, 'Repository'), tagPrefix: opt(cfg.tagPrefix) };
				case 'pypi':
					return { type, package: req(cfg.package, 'Package name') };
				case 'npm':
					return { type, package: req(cfg.package, 'Package name'), registry: opt(cfg.registry) };
				case 'apt':
					return { type, url: req(cfg.url, 'Packages URL'), package: req(cfg.package, 'Package name') };
				case 'url': {
					const kind = cfg.kind === 'json' ? 'json' : 'text';
					return {
						type,
						url: req(cfg.url, 'URL'),
						kind,
						field: kind === 'json' ? opt(cfg.field) : undefined,
						versionRegex: opt(cfg.versionRegex)
					};
				}
			}
		} catch (e) {
			errorMsg = e instanceof Error ? e.message : String(e);
			return null;
		}
	}

	function req(value: string | undefined, label: string): string {
		if (!value || !value.trim()) throw new Error(`${label} is required`);
		return value.trim();
	}
	function opt(value: string | undefined): string | undefined {
		return value?.trim() ? value.trim() : undefined;
	}
</script>

<div class="card form-card">
	{#if errorMsg}
		<div class="error">{errorMsg}</div>
	{/if}

	<div class="field">
		<label for="sf-name">Name <input id="sf-name" bind:value={name} placeholder="e.g. nginx releases" /></label>
	</div>

	<div class="field">
		<label for="sf-type">Type
			<select id="sf-type" bind:value={type}>
				{#each Object.keys(TYPE_LABELS) as t}
					<option value={t}>{TYPE_LABELS[t as SourceType]}</option>
				{/each}
			</select>
		</label>
	</div>

	{#if type === 'docker'}
		<div class="field">
			<label for="sf-registry">Registry <input id="sf-registry" bind:value={cfg.registry} placeholder="registry-1.docker.io (default)" /></label>
			<p class="hint">Leave empty for Docker Hub. Custom registries use the OCI distribution API.</p>
		</div>
		<div class="field">
			<label for="sf-repository">Repository <input id="sf-repository" bind:value={cfg.repository} placeholder="library/nginx" /></label>
		</div>
		<div class="field">
			<label for="sf-tagfilter">Tag filter <input id="sf-tagfilter" bind:value={cfg.tagFilter} placeholder="optional, e.g. main or 1.2" /></label>
		</div>
	{:else if type === 'github'}
		<div class="row">
			<div class="field">
				<label for="sf-owner">Owner <input id="sf-owner" bind:value={cfg.owner} placeholder="octocat" /></label>
			</div>
			<div class="field">
				<label for="sf-gh-repo">Repository <input id="sf-gh-repo" bind:value={cfg.repo} placeholder="hello-world" /></label>
			</div>
		</div>
		<div class="field">
			<label for="sf-tagprefix">Tag prefix <input id="sf-tagprefix" bind:value={cfg.tagPrefix} placeholder="optional, e.g. v" /></label>
		</div>
	{:else if type === 'pypi'}
		<div class="field">
			<label for="sf-pkg">Package name <input id="sf-pkg" bind:value={cfg.package} placeholder="requests" /></label>
		</div>
	{:else if type === 'npm'}
		<div class="field">
			<label for="sf-npm-pkg">Package name <input id="sf-npm-pkg" bind:value={cfg.package} placeholder="express or @scope/pkg" /></label>
		</div>
		<div class="field">
			<label for="sf-npm-registry">Registry <input id="sf-npm-registry" bind:value={cfg.registry} placeholder="https://registry.npmjs.org (default)" /></label>
		</div>
	{:else if type === 'apt'}
		<div class="field">
			<label for="sf-apt-url">Packages index URL <input id="sf-apt-url" bind:value={cfg.url} placeholder="https://example.com/debian/dists/stable/main/binary-amd64/Packages.gz" /></label>
			<p class="hint">A Packages (or Packages.gz) file, or a repository directory URL — Radar will find the Packages index.</p>
		</div>
		<div class="field">
			<label for="sf-apt-pkg">Package name <input id="sf-apt-pkg" bind:value={cfg.package} placeholder="nginx" /></label>
		</div>
	{:else if type === 'url'}
		<div class="field">
			<label for="sf-url">URL <input id="sf-url" bind:value={cfg.url} placeholder="https://example.com/version" /></label>
		</div>
		<div class="row">
			<div class="field">
				<label for="sf-kind">Response kind
					<select id="sf-kind" bind:value={cfg.kind}>
						<option value="text">Text</option>
						<option value="json">JSON</option>
					</select>
				</label>
			</div>
			{#if cfg.kind === 'json'}
				<div class="field">
					<label for="sf-json-field">JSON field (dotted path) <input id="sf-json-field" bind:value={cfg.field} placeholder="data.version" /></label>
				</div>
			{/if}
		</div>
		<div class="field">
			<label for="sf-verregex">Version regex <input id="sf-verregex" bind:value={cfg.versionRegex} placeholder="optional, e.g. v([0-9.]+)" /></label>
		</div>
	{/if}

	<div class="row">
		<div class="field checkbox" style="align-self:center">
			<input type="checkbox" id="prereleases" bind:checked={includePrereleases} />
			<label for="prereleases">Include prereleases</label>
		</div>
		<div class="field checkbox" style="align-self:center">
			<input type="checkbox" id="fullversions" bind:checked={fullVersionsOnly} />
			<label for="fullversions">Only full versions</label>
		</div>
		<div class="field">
			<label for="sf-poll">Poll interval (seconds) <input id="sf-poll" type="number" bind:value={pollInterval} min="60" /></label>
		</div>
	</div>

	<p class="hint" style="margin:0 0 12px">
		"Only full versions" ignores alias tags such as <span class="mono">latest</span>,
		<span class="mono">unstable</span> or short major tags like <span class="mono">v0.8</span>.
	</p>

	<div class="form-actions">
		<button class="btn primary" onclick={submit} disabled={saving}>{source ? 'Save' : 'Create'}</button>
		<a class="btn" href="/services/{serviceId}">Cancel</a>
	</div>
</div>

<style>
	.form-card {
		padding: 20px;
		max-width: 640px;
	}
</style>

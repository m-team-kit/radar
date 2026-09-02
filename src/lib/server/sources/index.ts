import type { ReleaseSourceView } from '$lib/types';
import { fetchDockerVersions } from './docker';
import { fetchGithubVersions } from './github';
import { fetchPypiVersions } from './pypi';
import { fetchNpmVersions } from './npm';
import { fetchAptVersions } from './apt';
import { fetchUrlVersions } from './url';

export async function fetchSourceVersions(source: ReleaseSourceView): Promise<string[]> {
	switch (source.type) {
		case 'docker': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'docker') throw new Error('invalid docker config');
			return fetchDockerVersions(cfg);
		}
		case 'github': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'github') throw new Error('invalid github config');
			return fetchGithubVersions(cfg);
		}
		case 'pypi': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'pypi') throw new Error('invalid pypi config');
			return fetchPypiVersions(cfg);
		}
		case 'npm': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'npm') throw new Error('invalid npm config');
			return fetchNpmVersions(cfg);
		}
		case 'apt': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'apt') throw new Error('invalid apt config');
			return fetchAptVersions(cfg);
		}
		case 'url': {
			const cfg = source.parsed_config;
			if (cfg.type !== 'url') throw new Error('invalid url config');
			return fetchUrlVersions(cfg);
		}
		default: {
			const _exhaustive: never = source.type;
			return _exhaustive;
		}
	}
}

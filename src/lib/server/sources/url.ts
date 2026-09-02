import type { UrlSourceConfig } from '$lib/types';
import { asStringArray, fetchWithTimeout, getPath } from './util';

export async function fetchUrlVersions(config: UrlSourceConfig): Promise<string[]> {
	const res = await fetchWithTimeout(config.url);
	const text = await res.text();

	if (config.versionRegex) {
		const re = new RegExp(config.versionRegex, 'g');
		const matches = [...text.matchAll(re)].map((m) => m[1] ?? m[0]);
		return matches;
	}

	if (config.kind === 'json') {
		const doc = JSON.parse(text) as unknown;
		const value = config.field ? getPath(doc, config.field) : doc;
		return asStringArray(value);
	}

	const trimmed = text.trim();
	return trimmed.length > 0 ? [trimmed] : [];
}

import { gunzipSync } from 'node:zlib';
import type { AptSourceConfig } from '$lib/types';
import { fetchWithTimeout } from './util';

/**
 * Parse a Debian Packages index into package -> versions.
 * Versions are deduplicated (multi-architecture repos list each package once
 * per architecture, with the same version).
 */
export function parsePackagesIndex(content: string): Map<string, string[]> {
	const versions = new Map<string, string[]>();
	let currentPackage: string | null = null;
	for (const rawLine of content.split('\n')) {
		const line = rawLine.trimEnd();
		if (line === '') {
			currentPackage = null;
			continue;
		}
		const idx = line.indexOf(':');
		if (idx === -1) continue;
		const field = line.slice(0, idx);
		const value = line.slice(idx + 1).trim();
		if (field === 'Package') {
			currentPackage = value;
			if (!versions.has(currentPackage)) versions.set(currentPackage, []);
		} else if (field === 'Version' && currentPackage) {
			const list = versions.get(currentPackage)!;
			if (!list.includes(value)) list.push(value);
		}
	}
	return versions;
}

export function looksLikeHtml(contentType: string | null, body: string): boolean {
	if (contentType?.toLowerCase().includes('text/html')) return true;
	const trimmed = body.trimStart().toLowerCase();
	return trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html');
}

/**
 * Find the best Packages index link in an HTML directory listing.
 * Prefers the plain "Packages", then "Packages.gz". .bz2 is skipped since
 * bzip2 is not supported.
 */
export function findPackagesLink(html: string): string | null {
	const hrefs = [...html.matchAll(/href=["']([^"']+)["']/g)].map((m) => m[1]);
	const exact = (name: string) => hrefs.find((h) => h === name || h.endsWith(`/${name}`));
	return exact('Packages') ?? exact('Packages.gz') ?? null;
}

function directoryBase(url: string): string {
	return url.endsWith('/') ? url : `${url}/`;
}

function decode(buffer: Buffer, url: string): string {
	if (url.endsWith('.gz') || (buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b)) {
		return gunzipSync(buffer).toString('utf8');
	}
	return buffer.toString('utf8');
}

async function fetchBytes(url: string): Promise<{ buffer: Buffer; contentType: string | null }> {
	const res = await fetchWithTimeout(url, {
		headers: { Accept: 'application/vnd.debian.binary-packages, text/html', 'User-Agent': 'radar' }
	});
	return { buffer: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') };
}

export async function fetchAptVersions(config: AptSourceConfig): Promise<string[]> {
	let { buffer, contentType } = await fetchBytes(config.url);

	// The URL may point at a repository directory that serves an HTML listing;
	// follow the Packages index link in that case.
	if (looksLikeHtml(contentType, buffer.toString('utf8'))) {
		const link = findPackagesLink(buffer.toString('utf8'));
		if (!link) {
			throw new Error('Response is an HTML directory listing with no Packages index link');
		}
		const packagesUrl = new URL(link, directoryBase(config.url)).toString();
		({ buffer, contentType } = await fetchBytes(packagesUrl));
	}

	const content = decode(buffer, config.url);
	const index = parsePackagesIndex(content);

	if (index.size === 0) {
		throw new Error('Response is not a Debian Packages index (no Package entries found)');
	}

	const versions = index.get(config.package) ?? [];
	if (versions.length === 0) {
		throw new Error(`Package "${config.package}" not found in the Packages index`);
	}
	return versions;
}

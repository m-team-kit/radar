import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAptVersions, findPackagesLink, looksLikeHtml, parsePackagesIndex } from '$lib/server/sources/apt';
import { compareVersions, pickLatest } from '$lib/versions';

const SAMPLE = `
Package: nginx
Version: 1.24.0-1~bpo12+1
Architecture: amd64

Package: nginx
Version: 1.22.1-1
Architecture: amd64

Package: curl
Version: 7.88.1-10+deb12u8
Architecture: amd64
`;

const MULTI_ARCH = `
Package: mytoken-server
Version: 0.10.1-1
Architecture: amd64

Package: mytoken-server
Version: 0.10.1-1
Architecture: arm64

Package: mytoken-server
Version: 0.10.1-1
Architecture: i386
`;

describe('parsePackagesIndex', () => {
	it('collects all versions for a package', () => {
		const index = parsePackagesIndex(SAMPLE);
		expect(index.get('nginx')).toEqual(['1.24.0-1~bpo12+1', '1.22.1-1']);
		expect(index.get('curl')).toEqual(['7.88.1-10+deb12u8']);
	});

	it('returns an empty list for a missing package', () => {
		expect(parsePackagesIndex(SAMPLE).get('missing') ?? []).toEqual([]);
	});

	it('deduplicates versions across architectures', () => {
		expect(parsePackagesIndex(MULTI_ARCH).get('mytoken-server')).toEqual(['0.10.1-1']);
	});
});

describe('looksLikeHtml', () => {
	it('detects by content type', () => {
		expect(looksLikeHtml('text/html;charset=utf-8', '')).toBe(true);
		expect(looksLikeHtml('text/plain', 'Package: nginx\nVersion: 1.0')).toBe(false);
	});

	it('detects by body', () => {
		expect(looksLikeHtml(null, '<!DOCTYPE html><html><body></body></html>')).toBe(true);
		expect(looksLikeHtml(null, '<html><head></head></html>')).toBe(true);
		expect(looksLikeHtml(null, 'Package: nginx\nVersion: 1.0')).toBe(false);
	});
});

describe('findPackagesLink', () => {
	const html = `<html><a href="../">..</a><a href="Packages">Packages</a><a href="Packages.bz2">Packages.bz2</a></html>`;

	it('prefers the plain Packages link', () => {
		expect(findPackagesLink(html)).toBe('Packages');
	});

	it('falls back to Packages.gz', () => {
		expect(findPackagesLink(`<a href="Packages.gz">Packages.gz</a>`)).toBe('Packages.gz');
	});

	it('returns null when no index link exists', () => {
		expect(findPackagesLink('<a href="foo.deb">foo.deb</a>')).toBeNull();
	});
});

describe('fetchAptVersions', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const HTML_LISTING =
		'<!DOCTYPE html><html><head><title>Index</title></head><body>' +
		'<a href="Packages">Packages</a><a href="Packages.bz2">Packages.bz2</a></body></html>';
	const PACKAGES_INDEX = `Package: mytoken-server\nVersion: 0.10.1-1\nArchitecture: amd64\n\nPackage: mytoken-server\nVersion: 0.10.1-1\nArchitecture: arm64\n`;

	function mockFetch(routes: { match: (url: string) => boolean; response: () => Response }[]) {
		vi.stubGlobal(
			'fetch',
			vi.fn(async (input: string | URL) => {
				const url = String(input);
				for (const route of routes) {
					if (route.match(url)) return route.response();
				}
				return new Response('not found', { status: 404 });
			})
		);
	}

	it('follows a Packages link from a directory listing URL', async () => {
		mockFetch([
			{
				match: (u) => u.endsWith('/debian/stable/'),
				response: () => new Response(HTML_LISTING, { headers: { 'content-type': 'text/html' } })
			},
			{
				match: (u) => u.endsWith('/debian/stable/Packages'),
				response: () =>
					new Response(PACKAGES_INDEX, { headers: { 'content-type': 'application/vnd.debian.binary-packages' } })
			}
		]);

		const versions = await fetchAptVersions({
			url: 'https://repo.example.com/debian/stable/',
			package: 'mytoken-server'
		});
		expect(versions).toEqual(['0.10.1-1']);
	});

	it('parses a direct Packages file URL', async () => {
		mockFetch([
			{
				match: (u) => u.endsWith('/Packages'),
				response: () => new Response(PACKAGES_INDEX, { headers: { 'content-type': 'text/plain' } })
			}
		]);

		const versions = await fetchAptVersions({
			url: 'https://repo.example.com/debian/stable/Packages',
			package: 'mytoken-server'
		});
		expect(versions).toEqual(['0.10.1-1']);
	});

	it('throws when the package is not in the index', async () => {
		mockFetch([
			{
				match: () => true,
				response: () => new Response(PACKAGES_INDEX, { headers: { 'content-type': 'text/plain' } })
			}
		]);

		await expect(
			fetchAptVersions({ url: 'https://repo.example.com/Packages', package: 'does-not-exist' })
		).rejects.toThrow('not found in the Packages index');
	});

	it('throws when the response is not a Packages index', async () => {
		mockFetch([
			{
				match: () => true,
				response: () => new Response('just some text', { headers: { 'content-type': 'text/plain' } })
			}
		]);

		await expect(fetchAptVersions({ url: 'https://repo.example.com/foo', package: 'x' })).rejects.toThrow(
			'not a Debian Packages index'
		);
	});
});

describe('apt version selection', () => {
	it('picks the newest nginx package with proper debian comparison', () => {
		const versions = parsePackagesIndex(SAMPLE).get('nginx')!;
		expect(pickLatest(versions, 'debian', true)).toBe('1.24.0-1~bpo12+1');
		expect(compareVersions('1.24.0-1~bpo12+1', '1.22.1-1', 'debian')).toBe(1);
	});
});

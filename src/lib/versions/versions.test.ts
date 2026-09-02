import { describe, expect, it } from 'vitest';
import {
	compareVersions,
	getVersionKind,
	isCanonicalVersion,
	isPrerelease,
	normalizeVersion,
	orderVersionCategories,
	pickLatest,
	sortNewestFirst
} from '$lib/versions';

describe('compareVersions (semver)', () => {
	it('compares regular versions', () => {
		expect(compareVersions('1.2.3', '1.2.4')).toBe(-1);
		expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
		expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
	});

	it('handles a leading v prefix', () => {
		expect(compareVersions('v1.2.3', '1.2.4')).toBe(-1);
		expect(compareVersions('v1.10.0', 'v1.9.0')).toBe(1);
	});

	it('orders prereleases below the release', () => {
		expect(compareVersions('1.2.3-rc.1', '1.2.3')).toBe(-1);
		expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBe(-1);
	});

	it('sorts invalid strings below valid semver', () => {
		expect(compareVersions('latest', '1.2.3')).toBe(-1);
		expect(compareVersions('1.2.3', 'latest')).toBe(1);
		expect(compareVersions('apple', 'banana')).toBeLessThan(0);
	});
});

describe('compareVersions (debian)', () => {
	it('treats ~ as a prerelease marker before everything', () => {
		expect(compareVersions('1.0.0~rc1', '1.0.0', 'debian')).toBe(-1);
		expect(compareVersions('1.0~pre', '1.0', 'debian')).toBe(-1);
	});

	it('compares epochs numerically first', () => {
		expect(compareVersions('2:1.0.0', '1:2.0.0', 'debian')).toBe(1);
		expect(compareVersions('1:1.0.0', '1.0.0', 'debian')).toBe(1);
	});

	it('compares numeric runs numerically', () => {
		expect(compareVersions('1.0.9', '1.0.10', 'debian')).toBe(-1);
		expect(compareVersions('1.0.10', '1.0.9', 'debian')).toBe(1);
	});

	it('compares the debian revision', () => {
		expect(compareVersions('1.0.0-1', '1.0.0-2', 'debian')).toBe(-1);
		expect(compareVersions('1.0.0-1', '1.0.0', 'debian')).toBe(1);
	});
});

describe('isPrerelease', () => {
	it('detects semver prereleases', () => {
		expect(isPrerelease('1.2.3', 'semver')).toBe(false);
		expect(isPrerelease('1.2.3-rc.1', 'semver')).toBe(true);
		expect(isPrerelease('v1.2.3-beta', 'semver')).toBe(true);
	});

	it('detects debian ~ prereleases', () => {
		expect(isPrerelease('1.0', 'debian')).toBe(false);
		expect(isPrerelease('1.0~rc1', 'debian')).toBe(true);
		expect(isPrerelease('1.0~beta2+b1', 'debian')).toBe(true);
	});
});

describe('sortNewestFirst / pickLatest', () => {
	const versions = ['1.0.0', '1.2.0', '1.1.0', '1.2.0-rc.1', '0.9.0'];

	it('sorts newest first including prereleases', () => {
		const sorted = sortNewestFirst(versions, 'semver', true);
		expect(sorted[0]).toBe('1.2.0');
		expect(sorted[1]).toBe('1.2.0-rc.1');
		expect(sorted[sorted.length - 1]).toBe('0.9.0');
	});

	it('excludes prereleases when told to', () => {
		const sorted = sortNewestFirst(versions, 'semver', false);
		expect(sorted).not.toContain('1.2.0-rc.1');
		expect(sorted[0]).toBe('1.2.0');
	});

	it('picks the latest stable version', () => {
		expect(pickLatest(versions, 'semver', false)).toBe('1.2.0');
	});

	it('uses the debian comparator for apt', () => {
		const aptVersions = ['1.0.10', '1.0.9', '1.0.0~rc1'];
		expect(pickLatest(aptVersions, 'debian', true)).toBe('1.0.10');
		expect(pickLatest(aptVersions, 'debian', false)).toBe('1.0.10');
	});
});

describe('getVersionKind', () => {
	it('maps apt to debian and everything else to semver', () => {
		expect(getVersionKind('apt')).toBe('debian');
		expect(getVersionKind('github')).toBe('semver');
		expect(getVersionKind('docker')).toBe('semver');
	});
});

describe('normalizeVersion', () => {
	it('strips a leading v/V for valid semver', () => {
		expect(normalizeVersion('v1.2.3', 'semver')).toBe('1.2.3');
		expect(normalizeVersion('V1.2.3', 'semver')).toBe('1.2.3');
		expect(normalizeVersion('v1.2.3-rc.1', 'semver')).toBe('1.2.3-rc.1');
	});

	it('leaves non-semver and already-normalized versions unchanged', () => {
		expect(normalizeVersion('1.2.3', 'semver')).toBe('1.2.3');
		expect(normalizeVersion('latest', 'semver')).toBe('latest');
		expect(normalizeVersion('release-1.2.3', 'semver')).toBe('release-1.2.3');
	});

	it('does not touch debian versions', () => {
		expect(normalizeVersion('v1.0-1', 'debian')).toBe('v1.0-1');
		expect(normalizeVersion('1.24.0-1~bpo12+1', 'debian')).toBe('1.24.0-1~bpo12+1');
	});
});

describe('isCanonicalVersion', () => {
	it('treats full major.minor.patch tags as canonical', () => {
		expect(isCanonicalVersion('v0.8.1', 'semver')).toBe(true);
		expect(isCanonicalVersion('0.12.0-pr93', 'semver')).toBe(true);
		expect(isCanonicalVersion('release-1.2.3', 'semver')).toBe(true);
		expect(isCanonicalVersion('2024.12.31', 'semver')).toBe(true);
	});

	it('treats alias/short tags as non-canonical', () => {
		expect(isCanonicalVersion('v0.8', 'semver')).toBe(false);
		expect(isCanonicalVersion('v0.5', 'semver')).toBe(false);
		expect(isCanonicalVersion('1.2', 'semver')).toBe(false);
		expect(isCanonicalVersion('latest', 'semver')).toBe(false);
		expect(isCanonicalVersion('unstable', 'semver')).toBe(false);
	});

	it('treats debian versions as always canonical', () => {
		expect(isCanonicalVersion('1.24.0-1', 'debian')).toBe(true);
		expect(isCanonicalVersion('latest', 'debian')).toBe(true);
	});
});

describe('orderVersionCategories', () => {
	it('orders semver newest first', () => {
		expect(
			orderVersionCategories([
				{ v: '0.10.0', kind: 'semver' },
				{ v: '0.12.0', kind: 'semver' },
				{ v: '0.11.0', kind: 'semver' }
			])
		).toEqual(['0.12.0', '0.11.0', '0.10.0']);
	});

	it('orders debian newest first', () => {
		expect(
			orderVersionCategories([
				{ v: '1.0.9-1', kind: 'debian' },
				{ v: '1.0.10-1', kind: 'debian' }
			])
		).toEqual(['1.0.10-1', '1.0.9-1']);
	});

	it('groups semver above debian, newest first within each', () => {
		expect(
			orderVersionCategories([
				{ v: '1.0.10-1', kind: 'debian' },
				{ v: '0.11.0', kind: 'semver' },
				{ v: '1.0.9-1', kind: 'debian' },
				{ v: '0.10.0', kind: 'semver' }
			])
		).toEqual(['0.11.0', '0.10.0', '1.0.10-1', '1.0.9-1']);
	});

	it('dedups a version appearing in multiple series', () => {
		const order = orderVersionCategories([
			{ v: '0.11.0', kind: 'semver' },
			{ v: '0.10.0', kind: 'semver' },
			{ v: '0.11.0', kind: 'semver' }
		]);
		expect(order).toEqual(['0.11.0', '0.10.0']);
	});
});

import { valid, compare as semverCompare, prerelease } from 'semver';
import debCompare from 'deb-version-compare';
import type { VersionKind } from '$lib/types';

function toSemver(v: string): string | null {
	return valid(v, { loose: true });
}

/**
 * Compare two version strings.
 * Semver is compared with the semver library (loose: tolerates "v" prefixes).
 * Debian versions use the dpkg comparison algorithm.
 * Versions that are not valid for the kind fall back to a stable codepoint sort,
 * where valid versions are treated as newer than invalid ones.
 */
export function compareVersions(a: string, b: string, kind: VersionKind = 'semver'): number {
	if (kind === 'debian') {
		try {
			return debCompare(a, b);
		} catch {
			return a.localeCompare(b);
		}
	}
	const aV = toSemver(a);
	const bV = toSemver(b);
	if (aV && bV) return semverCompare(aV, bV);
	if (!aV && !bV) return a.localeCompare(b);
	return aV ? 1 : -1;
}

/** Whether a version is a prerelease for the given version kind. */
export function isPrerelease(v: string, kind: VersionKind): boolean {
	if (kind === 'debian') return v.includes('~');
	return prerelease(toSemver(v) ?? v) !== null;
}

/**
 * Normalize a version string for consistent display/storage.
 * For semver, strips a leading "v"/"V" (the git-tag convention) when the
 * remainder is still a valid semver. Debian versions are left untouched.
 * Examples: "v1.2.3" -> "1.2.3", "v1.2.3-rc.1" -> "1.2.3-rc.1",
 * "latest" / "1.2" / "release-1.2.3" unchanged.
 */
export function normalizeVersion(v: string, kind: VersionKind): string {
	if (kind === 'debian') return v;
	const cleaned = v.replace(/^[vV]/, '');
	return toSemver(cleaned) ? cleaned : v;
}

/**
 * Whether a version is a real release rather than a floating/alias tag
 * (e.g. "latest", "unstable", or a short "v0.8" major tag).
 * Debian versions are always canonical. For semver, the tag must contain a
 * full major.minor.patch sequence.
 */
export function isCanonicalVersion(v: string, kind: VersionKind): boolean {
	if (kind === 'debian') return true;
	return /\d+\.\d+\.\d+/.test(v);
}

/**
 * Sort versions newest-first, optionally excluding prereleases.
 * Invalid versions sort to the bottom.
 */
export function sortNewestFirst(versions: string[], kind: VersionKind, includePrereleases: boolean): string[] {
	const filtered = includePrereleases ? versions : versions.filter((v) => !isPrerelease(v, kind));
	return [...filtered].sort((a, b) => compareVersions(b, a, kind));
}

export function pickLatest(versions: string[], kind: VersionKind, includePrereleases: boolean): string | null {
	const sorted = sortNewestFirst(versions, kind, includePrereleases);
	return sorted.length > 0 ? sorted[0] : null;
}

export function getVersionKind(sourceType: string): VersionKind {
	return sourceType === 'apt' ? 'debian' : 'semver';
}

/**
 * Order unique versions for a chart axis, newest first.
 * Versions are grouped by kind (semver then debian) since cross-kind versions
 * aren't comparable; within each group they are sorted newest-first.
 * When the same version appears in multiple series, the first kind wins.
 */
export function orderVersionCategories(entries: { v: string; kind: VersionKind }[]): string[] {
	const seen = new Map<string, VersionKind>();
	for (const e of entries) {
		if (!seen.has(e.v)) seen.set(e.v, e.kind);
	}
	const group = (kind: VersionKind) =>
		[...seen.entries()]
			.filter(([, k]) => k === kind)
			.map(([v]) => v)
			.sort((a, b) => compareVersions(b, a, kind));
	return [...group('semver'), ...group('debian')];
}

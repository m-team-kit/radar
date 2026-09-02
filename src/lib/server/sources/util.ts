export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 15000): Promise<Response> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { ...init, signal: controller.signal });
		if (!res.ok) {
			throw new Error(`HTTP ${res.status} for ${url}`);
		}
		return res;
	} finally {
		clearTimeout(timer);
	}
}

/** Resolve a dotted path like "a.b.c" in a parsed JSON document. */
export function getPath(doc: unknown, path: string): unknown {
	let cur: unknown = doc;
	for (const part of path.split('.')) {
		if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
		cur = (cur as Record<string, unknown>)[part];
	}
	return cur;
}

export function asString(value: unknown): string | null {
	if (typeof value === 'string') return value;
	if (typeof value === 'number') return String(value);
	return null;
}

export function asStringArray(value: unknown): string[] {
	if (Array.isArray(value)) {
		return value.map(asString).filter((v): v is string => v !== null);
	}
	const s = asString(value);
	return s ? [s] : [];
}

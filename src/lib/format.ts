export function timeAgo(iso: string | null | undefined): string {
	if (!iso) return 'never';
	const ms = Date.now() - new Date(iso).getTime();
	if (ms < 0) return 'just now';
	const s = Math.floor(ms / 1000);
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 30) return `${d}d ago`;
	return new Date(iso).toLocaleDateString();
}

export function shortIso(iso: string | null | undefined): string {
	if (!iso) return '—';
	return new Date(iso).toLocaleString();
}

export function sourceTypeLabel(type: string): string {
	return type;
}

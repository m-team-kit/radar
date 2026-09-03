import { get, writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

const KEY = 'radar-theme';

function resolveInitial(): Theme {
	if (typeof document === 'undefined') return 'light';
	const attr = document.documentElement.dataset.theme;
	if (attr === 'dark' || attr === 'light') return attr;
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const theme = writable<Theme>(resolveInitial());

export function setTheme(t: Theme) {
	document.documentElement.dataset.theme = t;
	localStorage.setItem(KEY, t);
	theme.set(t);
}

export function toggleTheme() {
	setTheme(get(theme) === 'dark' ? 'light' : 'dark');
}

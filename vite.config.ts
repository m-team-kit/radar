import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { loadServerBinding } from './src/lib/server/config';

const binding = loadServerBinding();

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		host: binding?.host,
		port: binding?.port,
		strictPort: true
	}
});

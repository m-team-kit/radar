// Preload hook for the production server (`node --import ./scripts/set-env.mjs build`).
// Bridges the YAML config's server binding (host/port/base_url) into the env
// variables that @sveltejs/adapter-node reads (HOST/PORT/ORIGIN).
// Per project convention the config file wins over env vars; env vars are only
// used as a fallback when no config file exists.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import YAML from 'yaml';

function configPath() {
	if (process.env.RADAR_CONFIG) return process.env.RADAR_CONFIG;
	const idx = process.argv.indexOf('--config');
	if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1];
	return resolve('config/radar.yaml');
}

const path = configPath();
if (existsSync(path)) {
	try {
		const parsed = YAML.parse(readFileSync(path, 'utf8')) ?? {};
		const server = parsed.server ?? {};
		if (typeof server.host === 'string') process.env.HOST = server.host;
		else if (!process.env.HOST) process.env.HOST = '0.0.0.0';
		if (typeof server.port === 'number') process.env.PORT = String(server.port);
		else if (!process.env.PORT) process.env.PORT = '3000';
		// ORIGIN is only derived when base_url is explicitly configured, since
		// adapter-node otherwise infers the origin from the request.
		if (typeof server.base_url === 'string' && server.base_url.length > 0) {
			process.env.ORIGIN = server.base_url;
		}
	} catch (err) {
		console.error(`[radar] Could not read config for server binding: ${err.message}`);
	}
}

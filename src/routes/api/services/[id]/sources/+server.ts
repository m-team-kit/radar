import { error, json } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { createSource, getSource } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { requireBool, requirePosInt, requireStr, validateSourceConfig } from '$lib/server/validate';
import type { SourceType } from '$lib/types';

const SOURCE_TYPES: SourceType[] = ['docker', 'github', 'pypi', 'npm', 'apt', 'url'];

export async function POST(event) {
	const user = requireUser(event);
	const body = await parseJsonBody(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);

	const input = runValidated(() => {
		const type = requireStr(body.type, 'type');
		if (!SOURCE_TYPES.includes(type as SourceType)) throw new Error('type must be one of docker, github, pypi, npm, apt, url');
		const config = typeof body.config === 'object' && body.config !== null ? (body.config as Record<string, unknown>) : {};
		return {
			name: requireStr(body.name, 'name'),
			type: type as SourceType,
			config: validateSourceConfig(type as SourceType, config),
			include_prereleases: body.include_prereleases !== undefined ? requireBool(body.include_prereleases, 'include_prereleases') : false,
			full_versions_only: body.full_versions_only !== undefined ? requireBool(body.full_versions_only, 'full_versions_only') : true,
			poll_interval_s:
				body.poll_interval_s !== undefined ? requirePosInt(body.poll_interval_s, 'poll_interval_s') : getConfig().polling.default_source_interval_s
		};
	});

	const source = createSource(db, event.params.id, input);
	return json(getSource(db, source.id), { status: 201 });
}

import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getDb } from '$lib/server/db';
import { deleteSource, getSource, updateSource } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { requireBool, requirePosInt, requireStr, validateSourceConfig } from '$lib/server/validate';
import type { SourceType } from '$lib/types';

const SOURCE_TYPES: SourceType[] = ['docker', 'github', 'pypi', 'npm', 'apt', 'url'];

async function requireEditableSource(event: RequestEvent) {
	const user = requireUser(event);
	const db = await getDb();
	const source = getSource(db, event.params.id);
	if (!source) throw error(404, 'Source not found');
	requireEditorForService(db, user, source.service_id);
	return { db, user, source };
}

export async function PATCH(event) {
	const { db, user, source } = await requireEditableSource(event);
	const body = await parseJsonBody(event);

	const input = runValidated(() => {
		const type = body.type !== undefined ? requireStr(body.type, 'type') : source.type;
		if (!SOURCE_TYPES.includes(type as SourceType)) throw new Error('type must be one of docker, github, pypi, npm, apt, url');
		const configBody = body.config !== undefined ? (body.config as Record<string, unknown>) : (source.parsed_config as unknown as Record<string, unknown>);
		return {
			name: body.name !== undefined ? requireStr(body.name, 'name') : undefined,
			type: type as SourceType,
			config: validateSourceConfig(type as SourceType, configBody),
			include_prereleases: body.include_prereleases !== undefined ? requireBool(body.include_prereleases, 'include_prereleases') : undefined,
			full_versions_only: body.full_versions_only !== undefined ? requireBool(body.full_versions_only, 'full_versions_only') : undefined,
			poll_interval_s: body.poll_interval_s !== undefined ? requirePosInt(body.poll_interval_s, 'poll_interval_s') : undefined
		};
	});

	updateSource(db, source.id, input);
	const updated = getSource(db, source.id);
	return json(updated);
}

export async function DELETE(event) {
	const { db } = await requireEditableSource(event);
	deleteSource(db, event.params.id);
	return new Response(null, { status: 204 });
}

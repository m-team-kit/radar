import { error, json } from '@sveltejs/kit';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { createDeployment, getDeployment, getSource } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { requireBool, requirePosInt, requireStr, validateQuery } from '$lib/server/validate';

export async function POST(event) {
	const user = requireUser(event);
	const body = await parseJsonBody(event);
	const db = await getDb();
	requireEditorForService(db, user, event.params.id);

	const input = runValidated(() => {
		const releaseSourceId = body.release_source_id !== null && body.release_source_id !== undefined ? requireStr(body.release_source_id, 'release_source_id') : null;
		if (releaseSourceId) {
			const source = getSource(db, releaseSourceId);
			if (!source || source.service_id !== event.params.id) {
				throw new Error('release_source_id must reference a source of this service');
			}
		}
		return {
			name: requireStr(body.name, 'name'),
			release_source_id: releaseSourceId,
			query: validateQuery(typeof body.query === 'object' && body.query !== null ? (body.query as Record<string, unknown>) : {}),
			poll_interval_s:
				body.poll_interval_s !== undefined ? requirePosInt(body.poll_interval_s, 'poll_interval_s') : getConfig().polling.default_deployment_interval_s,
			notify_enabled: body.notify_enabled !== undefined ? requireBool(body.notify_enabled, 'notify_enabled') : false,
			notify_emails: Array.isArray(body.notify_emails) ? (body.notify_emails as unknown[]).map(String) : [],
			notify_groups: Array.isArray(body.notify_groups) ? (body.notify_groups as unknown[]).map(String) : [],
			notify_webhook: typeof body.notify_webhook === 'string' ? body.notify_webhook : ''
		};
	});

	const deployment = createDeployment(db, event.params.id, input);
	return json(getDeployment(db, deployment.id), { status: 201 });
}

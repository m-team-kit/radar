import { error, json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { getDb } from '$lib/server/db';
import { deleteDeployment, getDeployment, getSource, updateDeployment } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { parseJsonBody, runValidated } from '$lib/server/http';
import { requireBool, requirePosInt, requireStr, validateQuery } from '$lib/server/validate';

async function requireEditableDeployment(event: RequestEvent) {
	const user = requireUser(event);
	const db = await getDb();
	const deployment = getDeployment(db, event.params.id);
	if (!deployment) throw error(404, 'Deployment not found');
	requireEditorForService(db, user, deployment.service_id);
	return { db, user, deployment };
}

export async function PATCH(event) {
	const { db, deployment } = await requireEditableDeployment(event);
	const body = await parseJsonBody(event);

	const input = runValidated(() => {
		const releaseSourceId =
			body.release_source_id !== undefined && body.release_source_id !== null
				? requireStr(body.release_source_id, 'release_source_id')
				: body.release_source_id === null
					? null
					: deployment.release_source_id;
		if (releaseSourceId) {
			const source = getSource(db, releaseSourceId);
			if (!source || source.service_id !== deployment.service_id) {
				throw new Error('release_source_id must reference a source of this service');
			}
		}
		return {
			name: body.name !== undefined ? requireStr(body.name, 'name') : undefined,
			release_source_id: releaseSourceId,
			query: body.query !== undefined ? validateQuery(body.query as Record<string, unknown>) : undefined,
			poll_interval_s: body.poll_interval_s !== undefined ? requirePosInt(body.poll_interval_s, 'poll_interval_s') : undefined,
			notify_enabled: body.notify_enabled !== undefined ? requireBool(body.notify_enabled, 'notify_enabled') : undefined,
			notify_emails: body.notify_emails !== undefined ? (body.notify_emails as unknown[]).map(String) : undefined,
			notify_groups: body.notify_groups !== undefined ? (body.notify_groups as unknown[]).map(String) : undefined,
			notify_webhook: body.notify_webhook !== undefined ? String(body.notify_webhook) : undefined
		};
	});

	updateDeployment(db, deployment.id, input);
	return json(getDeployment(db, deployment.id));
}

export async function DELETE(event) {
	const { db } = await requireEditableDeployment(event);
	deleteDeployment(db, event.params.id);
	return new Response(null, { status: 204 });
}

import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getDeployment } from '$lib/server/repos';
import { requireEditorForService, requireUser } from '$lib/server/auth/require';
import { refreshDeploymentNow } from '$lib/server/poller';

export async function POST(event) {
	const user = requireUser(event);
	const db = await getDb();
	const deployment = getDeployment(db, event.params.id);
	if (!deployment) throw error(404, 'Deployment not found');
	requireEditorForService(db, user, deployment.service_id);

	await refreshDeploymentNow(db, deployment.id);
	return json(getDeployment(db, deployment.id));
}

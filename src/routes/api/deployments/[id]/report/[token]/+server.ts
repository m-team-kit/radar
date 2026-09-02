import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { getDeployment, reportDeploymentVersion } from '$lib/server/repos';
import { requireStr } from '$lib/server/validate';

export async function POST(event) {
	const db = await getDb();
	const deployment = getDeployment(db, event.params.id);
	if (!deployment) throw error(404, 'Deployment not found');
	if (!deployment.report_token || deployment.report_token !== event.params.token) {
		throw error(404, 'Deployment not found');
	}

	let version: string;
	try {
		version = requireStr(((await event.request.json()) as Record<string, unknown>).version, 'version');
	} catch {
		throw error(400, 'Body must be JSON with a "version" field');
	}

	reportDeploymentVersion(db, deployment.id, version);
	return json({ ok: true, version, deployment: deployment.name });
}

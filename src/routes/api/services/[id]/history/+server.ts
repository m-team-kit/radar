import { error, json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { deploymentHistory, listDeployments, listSources, sourceHistory } from '$lib/server/repos';
import { requireAccessToService, requireUser } from '$lib/server/auth/require';

export async function GET(event) {
	const user = requireUser(event);
	const db = await getDb();
	requireAccessToService(db, user, event.params.id);

	const sources = listSources(db, event.params.id).map((s) => ({
		id: s.id,
		name: s.name,
		latest: s.latest_version,
		history: sourceHistory(db, s.id)
	}));
	const deployments = listDeployments(db, event.params.id).map((d) => ({
		id: d.id,
		name: d.name,
		current: d.current_version,
		history: deploymentHistory(db, d.id)
	}));

	return json({ service_id: event.params.id, sources, deployments });
}

import type Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { getConfig } from './config';
import { nowIso } from './db';
import type { DeploymentView, ReleaseSourceView } from '$lib/types';
import { deploymentLag } from './repos';
import { setDeploymentNotifiedVersion } from './repos';

let transporter: Transporter | null | undefined;

function getTransporter(): Transporter | null {
	if (transporter !== undefined) return transporter;
	const smtp = getConfig().smtp;
	if (!smtp) {
		transporter = null;
		return transporter;
	}
	transporter = nodemailer.createTransport({
		host: smtp.host,
		port: smtp.port,
		secure: smtp.secure,
		auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined
	});
	return transporter;
}

function groupMemberEmails(db: Database.Database, groups: string[]): string[] {
	if (groups.length === 0) return [];
	const rows = db
		.prepare(
			`SELECT DISTINCT email FROM known_users
			 WHERE email != ''
			   AND EXISTS (SELECT 1 FROM json_each(known_users.groups) WHERE json_each.value IN (SELECT json_each.value FROM json_each(?)))`
		)
		.all(JSON.stringify(groups)) as { email: string }[];
	return rows.map((r) => r.email);
}

function uniqueEmails(emails: string[]): string[] {
	return [...new Set(emails.filter((e) => e.includes('@')))];
}

async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
	const t = getTransporter();
	if (!t || to.length === 0) return;
	const smtp = getConfig().smtp!;
	await t.sendMail({ from: smtp.from, to, subject, text });
}

async function sendWebhook(url: string, payload: unknown): Promise<void> {
	if (!url) return;
	await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	});
}

/**
 * Notify each enabled deployment linked to `source` that is lagging behind
 * `latest`, once per (deployment, latest-version) pair.
 */
export async function notifyPendingUpdates(db: Database.Database, source: ReleaseSourceView, latest: string): Promise<void> {
	if (!latest) return;
	const deployments = db
		.prepare('SELECT * FROM deployments WHERE release_source_id = ?')
		.all(source.id) as DeploymentView[];
	// Re-parse arrays into views.
	const deps = deployments.map((d) => ({
		...d,
		query: JSON.parse(d.query_json) as DeploymentView['query'],
		notify_emails_list: JSON.parse(d.notify_emails) as string[],
		notify_groups_list: JSON.parse(d.notify_groups) as string[]
	}));

	const ts = nowIso();
	for (const dep of deps) {
		if (!dep.notify_enabled) continue;
		if (dep.last_notified_version === latest) continue;
		const lag = deploymentLag(db, dep, source);
		if (!lag.update_available) continue;

		const channels: string[] = [];
		if (getConfig().smtp) {
			const recipients = uniqueEmails([...dep.notify_emails_list, ...groupMemberEmails(db, dep.notify_groups_list)]);
			if (recipients.length > 0) {
				channels.push('email');
				await sendEmail(
					recipients,
					`[RADAR] ${source.name}: update available for ${dep.name}`,
					`Release source "${source.name}" now has ${latest}. Deployment "${dep.name}" is on ${dep.current_version ?? 'unknown'} (${lag.behind ?? '?'} behind).`
				);
			}
		}
		if (dep.notify_webhook) {
			channels.push('webhook');
			await sendWebhook(dep.notify_webhook, {
				event: 'update_available',
				service_id: dep.service_id,
				source: source.name,
				source_id: source.id,
				deployment: dep.name,
				deployment_id: dep.id,
				latest,
				deployed: dep.current_version,
				behind: lag.behind
			});
		}

		if (channels.length > 0) {
			db.prepare('INSERT INTO notification_events (deployment_id, source_id, version, channels, created_at) VALUES (?, ?, ?, ?, ?)').run(
				dep.id,
				source.id,
				latest,
				JSON.stringify(channels),
				ts
			);
			setDeploymentNotifiedVersion(db, dep.id, latest);
		}
	}
}

import { error } from '@sveltejs/kit';
import type { RequestEvent } from '@sveltejs/kit';
import type Database from 'better-sqlite3';
import { serviceAccess } from '../repos';
import type { AccessLevel } from '$lib/types';

export function requireUser(event: RequestEvent) {
	if (!event.locals.user) throw error(401, 'Not authenticated');
	return event.locals.user;
}

export function requireAccessToService(db: Database.Database, user: { sub: string; groups: string[] }, serviceId: string): AccessLevel {
	const access = serviceAccess(db, user, serviceId);
	if (access.access === 'none') throw error(404, 'Service not found');
	return access;
}

export function requireEditorForService(db: Database.Database, user: { sub: string; groups: string[] }, serviceId: string): void {
	const access = serviceAccess(db, user, serviceId);
	if (access.access !== 'editor') throw error(403, 'Editor access required');
}

declare global {
	namespace App {
		interface Locals {
			user: {
				sub: string;
				email: string;
				name: string;
				groups: string[];
			} | null;
		}
		// interface Error {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};

import type { Db } from "../src/client";
import { WORKSPACE_ID, workspaceSlug } from "../src/workspace";

/**
 * Optional demo-instance seeding, on only when DEMO_SEED_OWNER_EMAIL is set.
 *
 * It gives the workspace a synthetic owner, so whoever signs in first (the
 * public demo user) is never promoted to owner, and hands the demo user —
 * DEMO_LOGIN_EMAIL — a share of the seed deals so the "Me" view is not $0.
 * The demo user stays a plain member; the API forces that on every sign-in
 * too.
 */

export const DEMO_OWNER_ID = "seed-demo-owner";
export const DEMO_MEMBER_ID = "seed-demo-member";

const DEFAULT_WORKSPACE_NAME = "CRM";

export type DemoSeedSettings = {
	ownerEmail: string;
	memberEmail: string | null;
};

export function readDemoSeedSettings(
	env: Record<string, string | undefined> = process.env,
): DemoSeedSettings | null {
	const ownerEmail = env.DEMO_SEED_OWNER_EMAIL?.trim().toLowerCase();
	if (!ownerEmail) return null;

	const memberEmail = env.DEMO_LOGIN_EMAIL?.trim().toLowerCase() || null;

	if (memberEmail === ownerEmail) {
		throw new Error(
			"DEMO_SEED_OWNER_EMAIL must differ from DEMO_LOGIN_EMAIL: the demo user is never the owner.",
		);
	}

	return { ownerEmail, memberEmail };
}

/**
 * Every other open deal and every third closed one, in id order, so a reseed
 * picks the same deals and the demo user has live pipeline and some history.
 */
export function demoDealIds(
	deals: readonly { id: string; closedAt: Date | null }[],
): string[] {
	const sorted = [...deals].sort((a, b) => a.id.localeCompare(b.id));
	const open = sorted.filter((deal) => deal.closedAt === null);
	const closed = sorted.filter((deal) => deal.closedAt !== null);

	return [
		...open.filter((_, index) => index % 2 === 0),
		...closed.filter((_, index) => index % 3 === 0),
	].map((deal) => deal.id);
}

export async function seedDemo(
	db: Db,
	env: Record<string, string | undefined> = process.env,
): Promise<{ assigned: number } | null> {
	const settings = readDemoSeedSettings(env);
	if (!settings) return null;

	const workspace = await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: DEFAULT_WORKSPACE_NAME,
			slug: workspaceSlug(DEFAULT_WORKSPACE_NAME),
			createdAt: new Date(),
		},
		update: {},
		select: { id: true },
	});

	const owner = await upsertUser(
		db,
		DEMO_OWNER_ID,
		settings.ownerEmail,
		"Demo Owner",
	);

	// Enrol everyone already here before the owner, the way the first real
	// sign-in would, so the seed reps stay visible as members.
	if (
		(await db.member.count({ where: { organizationId: workspace.id } })) === 0
	) {
		const users = await db.user.findMany({ select: { id: true } });
		await db.member.createMany({
			data: users.map((user) => ({
				id: crypto.randomUUID(),
				organizationId: workspace.id,
				userId: user.id,
				role: "member",
				createdAt: new Date(),
			})),
			skipDuplicates: true,
		});
	}

	await setRole(db, workspace.id, owner, "owner");

	if (!settings.memberEmail) {
		console.log(
			"Demo owner seeded. DEMO_LOGIN_EMAIL is not set, so no deals were assigned to a demo user.",
		);
		return { assigned: 0 };
	}

	const member = await upsertUser(
		db,
		DEMO_MEMBER_ID,
		settings.memberEmail,
		"Demo",
	);
	await setRole(db, workspace.id, member, "member");

	const deals = await db.deal.findMany({
		where: { id: { startsWith: "seed-deal-" } },
		select: { id: true, closedAt: true },
	});
	const ids = demoDealIds(deals);

	await db.deal.updateMany({
		where: { id: { in: ids } },
		data: { ownerId: member },
	});

	console.log(
		`Demo owner seeded; ${ids.length} seed deal(s) assigned to the demo user.`,
	);
	return { assigned: ids.length };
}

async function upsertUser(
	db: Db,
	id: string,
	email: string,
	name: string,
): Promise<string> {
	const user = await db.user.upsert({
		where: { email },
		create: { id, email, name, emailVerified: true, updatedAt: new Date() },
		update: {},
		select: { id: true },
	});
	return user.id;
}

async function setRole(
	db: Db,
	organizationId: string,
	userId: string,
	role: "owner" | "member",
): Promise<void> {
	await db.member.upsert({
		where: { organizationId_userId: { organizationId, userId } },
		create: {
			id: crypto.randomUUID(),
			organizationId,
			userId,
			role,
			createdAt: new Date(),
		},
		update: { role },
	});
}

import { isDemoUser } from "@crm/auth/demo";
import { DemoBanner } from "@crm/ui/components/demo-banner";
import { connection } from "next/server";
import { getSession } from "@/lib/session";

/**
 * The shared-demo notice for the demo user, decided on the server. It streams
 * in as plain markup, so it never depends on client state and cannot change
 * what hydrates.
 */
export async function DemoUserBanner() {
	await connection();
	const session = await getSession().catch(() => null);
	if (!isDemoUser(session?.user.email)) return null;
	return <DemoBanner />;
}

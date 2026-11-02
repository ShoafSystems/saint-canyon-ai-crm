import { afterAll } from "bun:test";

// @crm/auth reads provider credentials once, on first import, and whichever
// spec imports it first wins. Set them here, before any spec loads, so the
// suite sees Google configured in any order (CI sets the same pair).
process.env.GOOGLE_CLIENT_ID ||= "test-google-client-id";
process.env.GOOGLE_CLIENT_SECRET ||= "test-google-client-secret";

afterAll(async () => {
	if (!process.env.DATABASE_URL) return;
	const { db } = await import("@crm/db");
	await db.$disconnect();
});

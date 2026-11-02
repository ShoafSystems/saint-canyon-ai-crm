import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback(
	"TEST_DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm_test?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");

const DEMO_EMAIL = "demo@demo.example";
const WORKSPACE = "workspace";

type Store = {
	users: { id: string; email: string }[];
	members: Map<string, string>;
	sessions: Session[];
};

type Session = {
	token: string;
	userId: string;
	expiresAt: Date;
	ipAddress: string | null;
	userAgent: string | null;
};

function fakeDb(store: Store) {
	return {
		user: {
			upsert: async ({
				where,
				create,
			}: {
				where: { email: string };
				create: { id: string; email: string };
			}) => {
				const found = store.users.find((user) => user.email === where.email);
				if (found) return { id: found.id };
				store.users.push({ id: create.id, email: create.email });
				store.members.set(create.id, "owner");
				return { id: create.id };
			},
		},
		member: {
			update: async ({
				where,
				data,
			}: {
				where: { organizationId_userId: { userId: string } };
				data: { role: string };
			}) => {
				store.members.set(where.organizationId_userId.userId, data.role);
				return {};
			},
		},
		session: {
			create: async ({ data }: { data: Session }) => {
				store.sessions.push(data);
				return data;
			},
		},
	};
}

describe("demo sign-in", () => {
	let app: INestApplication;
	let store: Store;
	let appOrigin: string;
	let sessionCookieName: string;

	beforeAll(async () => {
		const { DATABASE } = await import("../src/database/database.constants");
		const { DemoController } = await import("../src/demo/demo.controller");
		const { DemoLoginService } = await import("../src/demo/demo-login.service");
		const { appUrl } = await import("@crm/auth/env");
		const { SESSION_COOKIE_NAME } = await import("@crm/auth/cookies");
		appOrigin = appUrl;
		sessionCookieName = SESSION_COOKIE_NAME;

		class EnrolledDemoLoginService extends DemoLoginService {
			protected override async enrol() {
				return WORKSPACE;
			}
		}

		store = { users: [], members: new Map(), sessions: [] };

		const moduleRef = await Test.createTestingModule({
			controllers: [DemoController],
			providers: [
				{ provide: DemoLoginService, useClass: EnrolledDemoLoginService },
				{ provide: DATABASE, useValue: fakeDb(store) },
			],
		}).compile();

		app = moduleRef.createNestApplication({ bodyParser: false });
		await app.init();
	});

	afterAll(async () => {
		await app.close();
	});

	beforeEach(() => {
		process.env.DEMO_LOGIN_ENABLED = "true";
		process.env.DEMO_LOGIN_EMAIL = DEMO_EMAIL;
		process.env.ALLOWED_SIGN_IN = `example.com,${DEMO_EMAIL}`;
	});

	it("answers 404 and reports disabled when the flag is off", async () => {
		process.env.DEMO_LOGIN_ENABLED = "false";

		await request(app.getHttpServer())
			.post("/demo/session")
			.set("Origin", appOrigin)
			.expect(404);

		const status = await request(app.getHttpServer()).get("/demo").expect(200);
		expect(status.body).toEqual({ enabled: false });
	});

	it("stays off when the demo address is not allowed to sign in", async () => {
		process.env.ALLOWED_SIGN_IN = "example.com";

		await request(app.getHttpServer())
			.post("/demo/session")
			.set("Origin", appOrigin)
			.expect(404);
	});

	it("stays off when only the demo address's domain is allowed", async () => {
		process.env.ALLOWED_SIGN_IN = "example.com,demo.example";

		await request(app.getHttpServer())
			.post("/demo/session")
			.set("Origin", appOrigin)
			.expect(404);
		const status = await request(app.getHttpServer()).get("/demo").expect(200);
		expect(status.body).toEqual({ enabled: false });
	});

	it("refuses a request from another origin", async () => {
		await request(app.getHttpServer())
			.post("/demo/session")
			.set("Origin", "https://evil.example")
			.expect(403);

		await request(app.getHttpServer()).post("/demo/session").expect(403);
	});

	it("mints a two-hour member session and sends the browser to the app", async () => {
		const status = await request(app.getHttpServer()).get("/demo").expect(200);
		expect(status.body).toEqual({ enabled: true });

		const before = Date.now();
		const response = await request(app.getHttpServer())
			.post("/demo/session")
			.set("Origin", appOrigin)
			.expect(303);

		expect(response.headers.location).toBe(`${appOrigin}/`);

		const user = store.users.find((row) => row.email === DEMO_EMAIL);
		expect(user).toBeDefined();
		expect(store.members.get(user?.id ?? "")).toBe("member");

		const session = store.sessions.at(-1);
		expect(session?.userId).toBe(user?.id);
		expect(session?.ipAddress).toBeNull();
		expect(session?.userAgent).toBeNull();
		const lifetime = (session?.expiresAt.getTime() ?? 0) - before;
		expect(lifetime).toBeGreaterThan(2 * 60 * 60 * 1000 - 5000);
		expect(lifetime).toBeLessThanOrEqual(2 * 60 * 60 * 1000 + 5000);

		const setCookie = [response.headers["set-cookie"] ?? []].flat().join(";");
		expect(setCookie).toContain(`${sessionCookieName}=`);
		expect(setCookie).toContain(encodeURIComponent(`${session?.token}.`));
		expect(setCookie).toContain("HttpOnly");
	});

	it("rate-limits repeated sign-ins", async () => {
		const statuses: number[] = [];
		for (let attempt = 0; attempt < 8; attempt++) {
			const response = await request(app.getHttpServer())
				.post("/demo/session")
				.set("Origin", appOrigin);
			statuses.push(response.status);
		}

		expect(statuses).toContain(429);
	});
});

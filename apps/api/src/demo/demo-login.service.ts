import { auth } from "@crm/auth/auth";
import { ensureWorkspaceMembership } from "@crm/auth/organization";
import { isWorkspaceEmail } from "@crm/auth/workspace";
import type { Db } from "@crm/db";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { getCookies } from "better-auth/cookies";
import { InjectDatabase } from "../database/database.constants";
import { DEMO_LOGIN, readDemoLoginSettings } from "./demo-config";

export type DemoSessionCookie = {
	name: string;
	value: string;
	expiresAt: Date;
	attributes: {
		secure: boolean;
		sameSite: "lax" | "strict" | "none";
		path: string;
		httpOnly: boolean;
		domain?: string;
	};
};

export type DemoSessionRequest = {
	ipAddress: string | undefined;
	userAgent: string | undefined;
};

@Injectable()
export class DemoLoginService {
	constructor(@InjectDatabase() private readonly db: Db) {}

	demoEmail(): string | undefined {
		const settings = readDemoLoginSettings();
		if (!settings.enabled || !settings.email) return undefined;
		return isWorkspaceEmail(settings.email) ? settings.email : undefined;
	}

	isEnabled(): boolean {
		return this.demoEmail() !== undefined;
	}

	async mintSession(
		email: string,
		request: DemoSessionRequest,
	): Promise<DemoSessionCookie> {
		const user = await this.db.user.upsert({
			where: { email },
			create: {
				id: `${DEMO_LOGIN.user.idPrefix}${Buffer.from(email).toString("hex").slice(0, DEMO_LOGIN.user.idHexLength)}`,
				email,
				name: DEMO_LOGIN.user.name,
				emailVerified: true,
				updatedAt: new Date(),
			},
			update: {},
			select: { id: true },
		});

		const workspaceId = await this.enrol(user.id);
		if (!workspaceId) {
			throw new ServiceUnavailableException("The demo workspace is not ready.");
		}

		await this.db.member.update({
			where: {
				organizationId_userId: { organizationId: workspaceId, userId: user.id },
			},
			data: { role: "member" },
		});

		const token = randomToken();
		const expiresAt = new Date(Date.now() + DEMO_LOGIN.session.lifetimeMs);

		await this.db.session.create({
			data: {
				id: token,
				token,
				userId: user.id,
				expiresAt,
				activeOrganizationId: workspaceId,
				ipAddress: request.ipAddress ?? null,
				userAgent: request.userAgent ?? null,
				updatedAt: new Date(),
			},
		});

		const { sessionToken } = getCookies(auth.options);

		return {
			name: sessionToken.name,
			value: await signCookieValue(token),
			expiresAt,
			attributes: {
				secure: Boolean(sessionToken.attributes.secure),
				sameSite: toSameSite(sessionToken.attributes.sameSite),
				path: sessionToken.attributes.path ?? "/",
				httpOnly: sessionToken.attributes.httpOnly ?? true,
				...(sessionToken.attributes.domain && {
					domain: sessionToken.attributes.domain,
				}),
			},
		};
	}

	protected enrol(userId: string): Promise<string | undefined> {
		return ensureWorkspaceMembership(userId);
	}
}

function randomToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(DEMO_LOGIN.token.bytes));
	return Buffer.from(bytes).toString("base64url");
}

function toSameSite(value: unknown): "lax" | "strict" | "none" {
	const lower = typeof value === "string" ? value.toLowerCase() : "lax";
	return lower === "strict" || lower === "none" ? lower : "lax";
}

async function signCookieValue(value: string): Promise<string> {
	const secret = process.env.BETTER_AUTH_SECRET;
	if (!secret) {
		throw new ServiceUnavailableException("BETTER_AUTH_SECRET is not set.");
	}

	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(value),
	);
	return `${value}.${Buffer.from(signature).toString("base64")}`;
}

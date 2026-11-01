import { z } from "zod";
import { API_URL } from "@/lib/env";

const DEMO_STATUS_TIMEOUT_MS = 2_000;

export const DEMO_SIGN_IN_URL = `${API_URL}/demo/session`;

const demoStatus = z
	.object({ enabled: z.boolean().catch(false) })
	.catch({ enabled: false });

export async function isDemoSignInEnabled(): Promise<boolean> {
	try {
		const response = await fetch(`${API_URL}/demo`, {
			cache: "no-store",
			signal: AbortSignal.timeout(DEMO_STATUS_TIMEOUT_MS),
		});

		if (!response.ok) return false;

		return demoStatus.parse(await response.json()).enabled;
	} catch {
		return false;
	}
}

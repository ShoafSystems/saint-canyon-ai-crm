"use client";

import {
	DEMO_DISABLED_NOTE,
	DemoDisabled,
} from "@crm/ui/components/demo-disabled";
import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useTRPC } from "@/lib/trpc/client";

const subscribeNever = () => () => {};

/**
 * True only for the shared public demo user, once the profile has loaded and
 * the page has hydrated. Some callers sit in the prerendered shell, which
 * never has the profile, while the client cache may already hold it; reading
 * it during hydration would render different markup and fail it (#418).
 */
export function useIsDemoUser(): boolean {
	const trpc = useTRPC();
	const hydrated = useSyncExternalStore(
		subscribeNever,
		() => true,
		() => false,
	);
	const demo = useQuery(trpc.users.me.queryOptions()).data?.demo === true;
	return hydrated && demo;
}

/**
 * Turns off the wrapped controls for the public demo user and says why. The
 * API refuses these actions regardless; this spares visitors the error. Until
 * the page hydrates and the profile loads the controls render as usual, so
 * server and client markup agree.
 */
export function DemoGate({
	noteFirst,
	className,
	children,
}: {
	noteFirst?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	const demo = useIsDemoUser();
	return (
		<DemoDisabled active={demo} noteFirst={noteFirst} className={className}>
			{children}
		</DemoDisabled>
	);
}

/** The same note on its own, for a page whose controls sit in a table. */
export function DemoNote() {
	const demo = useIsDemoUser();
	if (!demo) return null;
	return (
		<span className="text-muted-foreground text-xs">{DEMO_DISABLED_NOTE}</span>
	);
}

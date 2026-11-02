"use client";

import {
	DEMO_DISABLED_NOTE,
	DemoDisabled,
} from "@crm/ui/components/demo-disabled";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/client";

/** True only for the shared public demo user, once the profile has loaded. */
export function useIsDemoUser(): boolean {
	const trpc = useTRPC();
	return useQuery(trpc.users.me.queryOptions()).data?.demo === true;
}

/**
 * Turns off the wrapped controls for the public demo user and says why. The
 * API refuses these actions regardless; this spares visitors the error. Until
 * the profile loads (and during server rendering) the controls render as
 * usual, so server and client markup agree.
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

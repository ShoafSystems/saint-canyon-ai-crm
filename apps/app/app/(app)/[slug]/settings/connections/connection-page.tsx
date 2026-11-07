import { PageShell, PageShellFallback } from "@crm/ui/components/page-shell";
import { cn } from "@crm/ui/lib/utils";
import { DemoGate } from "@/components/demo-gate";

export function ConnectionPage({
	centered = false,
	className,
	children,
}: {
	centered?: boolean;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<PageShell
			width="narrow"
			className={cn(centered && "justify-center", className)}
		>
			{/* Inactive, the gate renders the children straight into the shell. */}
			<DemoGate
				noteFirst
				className={cn(
					"w-full flex-col items-stretch gap-6",
					centered && "flex-1 justify-center",
				)}
			>
				{children}
			</DemoGate>
		</PageShell>
	);
}

export function ConnectionPageLoading() {
	return <PageShellFallback width="narrow" shape="settings" />;
}

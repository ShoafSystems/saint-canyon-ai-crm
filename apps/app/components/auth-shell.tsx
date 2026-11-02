import Logo from "@crm/ui/components/logo";
import Link from "next/link";
import type { ReactNode } from "react";

// The glass backdrop and the frosted card come from the theme
// (data-slot="auth-shell" / "auth-card" in @crm/ui globals.css).
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main
			data-slot="auth-shell"
			className="dark grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]"
		>
			<section className="relative hidden min-h-svh overflow-hidden p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
				<div className="relative flex gap-2 text-sm/5">
					<Link href="/" aria-label="Homepage" className="flex">
						<Logo className="size-5 shrink-0" />
					</Link>
				</div>

				<div className="relative flex max-w-lg flex-col gap-8">
					<div className="flex flex-col gap-4">
						<p className="font-mono text-xs/4 text-muted-foreground uppercase">
							CRM
						</p>
						<h1 className="max-w-[14ch] text-5xl/14 font-semibold text-balance">
							Every customer, one place.
						</h1>
					</div>
				</div>

				<p className="relative font-mono text-xs/4 text-muted-foreground">
					Made with love by{" "}
					<a
						href="https://trycomp.ai"
						target="_blank"
						rel="noreferrer"
						className="underline underline-offset-4 hover:text-foreground"
					>
						Comp AI
					</a>
				</p>
			</section>

			<section className="flex min-h-svh flex-col px-4 py-8 sm:px-10 lg:px-14">
				<div className="flex flex-1 items-center justify-center py-6">
					<div
						data-slot="auth-card"
						className="flex w-full max-w-md flex-col gap-7 border p-6 sm:p-8"
					>
						{children}
					</div>
				</div>
			</section>
		</main>
	);
}

export function AuthHeading({
	title,
	description,
}: {
	title: string;
	description: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-3 text-left">
			<Link href="/" aria-label="Homepage" className="flex">
				<Logo className="size-6 shrink-0" />
			</Link>
			<div className="flex flex-col gap-1">
				<h2 className="text-2xl/8 font-semibold tracking-tight text-balance">
					{title}
				</h2>
				<p className="max-w-[34ch] text-sm/5 text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
		</div>
	);
}

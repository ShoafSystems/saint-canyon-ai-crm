import Logo from "@crm/ui/components/logo";
import Link from "next/link";
import type { ReactNode } from "react";

// The glass backdrop and the frosted card come from the theme
// (data-slot="auth-shell" / "auth-card" in @crm/ui globals.css).
export function AuthShell({ children }: { children: ReactNode }) {
	return (
		<main
			data-slot="auth-shell"
			className="dark flex min-h-svh flex-col bg-background text-foreground"
		>
			<header className="hidden p-8 lg:flex xl:px-12">
				<Link href="/" aria-label="Homepage" className="flex">
					<Logo className="size-5 shrink-0" />
				</Link>
			</header>

			{/* Hero and card share one centred row, so neither floats off to an edge. */}
			<div className="mx-auto grid w-full max-w-[1040px] flex-1 items-center gap-16 px-4 py-8 sm:px-10 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-0">
				<section className="hidden flex-col gap-5 lg:flex">
					<p className="font-medium text-sm/5 text-muted-foreground tracking-wide">
						CRM
					</p>
					<h1 className="max-w-[12ch] font-(family-name:--font-display) font-semibold text-6xl/[1.02] tracking-[-0.035em] text-balance xl:text-7xl/[1]">
						Every customer, one place.
					</h1>
				</section>

				<div className="flex justify-center lg:justify-end">
					<div
						data-slot="auth-card"
						className="flex w-full max-w-md flex-col gap-6 border p-6 sm:p-8"
					>
						{children}
					</div>
				</div>
			</div>

			<footer className="hidden p-8 lg:block xl:px-12">
				<p className="text-sm/5 text-muted-foreground">
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
			</footer>
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
			{/* The wide layout already shows the logo above the hero. */}
			<Link href="/" aria-label="Homepage" className="flex lg:hidden">
				<Logo className="size-6 shrink-0" />
			</Link>
			<div className="flex flex-col gap-1">
				<h2 className="font-(family-name:--font-display) font-semibold text-3xl/9 tracking-[-0.025em] text-balance">
					{title}
				</h2>
				<p className="max-w-[34ch] text-sm/5 text-muted-foreground text-pretty">
					{description}
				</p>
			</div>
		</div>
	);
}

import {
	PageShell,
	PageShellActions,
	PageShellContent,
	PageShellDescription,
	PageShellHeader,
	PageShellHeading,
	PageShellLoading,
	PageShellTitle,
} from "@crm/ui/components/page-shell";
import type { Metadata } from "next";
import { Suspense } from "react";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { requireSession } from "@/lib/session";
import { HydrateClient } from "@/lib/trpc/hydrate";
import { getServerQueryClient, getServerTrpc } from "@/lib/trpc/server";
import { CreateDealSheet } from "./create-deal-sheet";
import { boardListInput, loadDealsLayout } from "./deals-layout";
import { DealsLayoutToggle } from "./deals-layout-toggle";
import { dealsSearchParams } from "./deals-search-params";
import { DealsView } from "./deals-view";

export const metadata: Metadata = {
	title: "Deals",
};

export default function DealsPage({
	searchParams,
}: PageProps<"/[slug]/deals">) {
	return (
		<PageShell className="min-h-0">
			<PageShellHeader>
				<PageShellHeading>
					<PageShellTitle>Deals</PageShellTitle>
					<PageShellDescription>
						The pipeline, and everything that has already closed.
					</PageShellDescription>
				</PageShellHeading>
				<PageShellActions>
					<DealsLayoutToggle />
					<CreateDealSheet />
				</PageShellActions>
			</PageShellHeader>

			<PageShellContent className="min-h-0">
				<Suspense fallback={<PageShellLoading shape="table" />}>
					<Deals searchParams={searchParams} />
				</Suspense>
			</PageShellContent>
		</PageShell>
	);
}

async function Deals({
	searchParams,
}: Pick<PageProps<"/[slug]/deals">, "searchParams">) {
	const [, values, layout] = await Promise.all([
		requireSession(),
		dealsSearchParams.load(searchParams),
		loadDealsLayout(searchParams),
	]);

	const input = dealsSearchParams.toInput(values);
	const board = layout[SEARCH_PARAM.deals.layout] === "board";

	const trpc = getServerTrpc();
	const queryClient = getServerQueryClient();
	await Promise.all([
		queryClient.prefetchQuery(
			trpc.deals.list.queryOptions(board ? boardListInput(input) : input),
		),
		queryClient.prefetchQuery(trpc.users.list.queryOptions()),
		queryClient.prefetchQuery(trpc.companies.options.queryOptions({ q: "" })),
	]);

	return (
		<HydrateClient>
			<DealsView />
		</HydrateClient>
	);
}

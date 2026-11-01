"use client";

import ChevronLeft from "@carbon/icons-react/es/ChevronLeft";
import ChevronRight from "@carbon/icons-react/es/ChevronRight";
import type { DealStage } from "@crm/db/enums";
import { Button } from "@crm/ui/components/button";
import {
	Card,
	CardAction,
	CardHeader,
	CardPanel,
	CardPanelDetail,
	CardPanelEmpty,
	CardPanelScroll,
	CardTitle,
} from "@crm/ui/components/card";
import { Icon } from "@crm/ui/components/icon";
import { formatMoney } from "@crm/ui/lib/format";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { type DragEvent, useMemo } from "react";
import { CompanyCell } from "@/components/crm/company-cell";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	closeReasonParams,
	useStageMutation,
} from "@/components/crm/stage-change";
import { useTableQuery } from "@/components/data-table/use-table-query";
import { DEAL_STAGE_OPTIONS, LOSING_STAGES } from "@/lib/deal-stage";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/types";
import { adjacentStage, groupByStage } from "./deals-board-model";
import { boardListInput } from "./deals-layout";
import { dealsSearchParams } from "./deals-search-params";

type DealRow = RouterOutputs["deals"]["list"]["rows"][number];

const STAGES: readonly DealStage[] = DEAL_STAGE_OPTIONS.map(
	(option) => option.value,
);

const LABELS = new Map(
	DEAL_STAGE_OPTIONS.map((option) => [option.value, option.label]),
);

const DRAG_TYPE = "application/x-crm-deal";

function useMoveDeal() {
	const [, setCloseParams] = useQueryStates(closeReasonParams);
	const setStage = useStageMutation();

	const move = (deal: DealRow, stage: DealStage) => {
		if (deal.stage === stage) return;
		if (LOSING_STAGES.includes(stage)) {
			void setCloseParams({
				[SEARCH_PARAM.dialog.closeDeal]: deal.id,
				[SEARCH_PARAM.dialog.closeStage]: stage,
			});
			return;
		}
		setStage.mutate({ id: deal.id, stage });
	};

	return { move, pending: setStage.isPending };
}

export function DealsBoard() {
	const trpc = useTRPC();
	const openRecord = useOpenRecord();
	const { input } = useTableQuery(dealsSearchParams);
	const { move, pending } = useMoveDeal();

	const deals = useQuery({
		...trpc.deals.list.queryOptions(boardListInput(input)),
		placeholderData: (previous) => previous,
	});

	const rows = deals.data?.rows ?? [];
	const total = deals.data?.total ?? 0;
	const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const columns = useMemo(() => groupByStage(STAGES, rows), [rows]);

	const drop = (stage: DealStage) => (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		const deal = byId.get(event.dataTransfer.getData(DRAG_TYPE));
		if (deal) move(deal, stage);
	};

	return (
		<div className="flex min-h-0 flex-col gap-3">
			{total > rows.length ? (
				<p className="text-muted-foreground text-xs">
					Showing {rows.length} of {total} deals. Narrow the filters to see the
					rest.
				</p>
			) : null}

			<div className="grid min-h-0 auto-cols-[minmax(16rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
				{columns.map((column) => (
					<Card
						key={column.stage}
						aria-label={LABELS.get(column.stage)}
						onDragOver={(event) => {
							if (event.dataTransfer.types.includes(DRAG_TYPE)) {
								event.preventDefault();
							}
						}}
						onDrop={drop(column.stage)}
					>
						<CardHeader>
							<CardTitle>{LABELS.get(column.stage)}</CardTitle>
							<CardAction>
								<span className="text-muted-foreground text-xs tabular-nums">
									{column.deals.length}
								</span>
							</CardAction>
						</CardHeader>

						<CardPanel>
							{column.deals.length === 0 ? (
								<CardPanelEmpty>No deals.</CardPanelEmpty>
							) : (
								<CardPanelScroll className="gap-2 p-2">
									{column.deals.map((deal) => (
										<DealCard
											key={deal.id}
											deal={deal}
											pending={pending}
											onOpen={() => openRecord({ kind: "deal", id: deal.id })}
											onMove={(stage) => move(deal, stage)}
										/>
									))}
								</CardPanelScroll>
							)}
						</CardPanel>
					</Card>
				))}
			</div>
		</div>
	);
}

function DealCard({
	deal,
	pending,
	onOpen,
	onMove,
}: {
	deal: DealRow;
	pending: boolean;
	onOpen: () => void;
	onMove: (stage: DealStage) => void;
}) {
	const previous = adjacentStage(STAGES, deal.stage, -1);
	const next = adjacentStage(STAGES, deal.stage, 1);

	return (
		<CardPanelDetail
			draggable={!pending}
			onDragStart={(event) => {
				event.dataTransfer.setData(DRAG_TYPE, deal.id);
				event.dataTransfer.effectAllowed = "move";
			}}
		>
			<button
				type="button"
				onClick={onOpen}
				className="flex min-w-0 flex-col gap-1 text-left text-foreground"
			>
				<span className="truncate font-medium">{deal.name}</span>
				<CompanyCell company={deal.company} />
				{deal.amountCents === null ? null : (
					<span className="text-muted-foreground tabular-nums">
						{formatMoney(deal.amountCents, deal.currency)}
					</span>
				)}
			</button>

			<div className="flex items-center justify-between">
				<Button
					variant="ghost"
					size="icon-xs"
					disabled={pending || previous === null}
					aria-label={
						previous ? `Move to ${LABELS.get(previous)}` : "No earlier stage"
					}
					onClick={() => previous && onMove(previous)}
				>
					<Icon icon={ChevronLeft} />
				</Button>
				<Button
					variant="ghost"
					size="icon-xs"
					disabled={pending || next === null}
					aria-label={next ? `Move to ${LABELS.get(next)}` : "No later stage"}
					onClick={() => next && onMove(next)}
				>
					<Icon icon={ChevronRight} />
				</Button>
			</div>
		</CardPanelDetail>
	);
}

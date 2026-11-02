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
import {
	type DragEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
	const scroll = useBoardScroll();

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
			<div className="flex min-h-7 items-center justify-between gap-3">
				<p className="text-muted-foreground text-xs">
					{total > rows.length
						? `Showing ${rows.length} of ${total} deals. Narrow the filters to see the rest.`
						: null}
				</p>
				{scroll.canLeft || scroll.canRight ? (
					<div className="flex items-center gap-1">
						<Button
							variant="outline"
							size="icon-sm"
							disabled={!scroll.canLeft}
							aria-label="Earlier stages"
							onClick={() => scroll.by(-1)}
						>
							<Icon icon={ChevronLeft} />
						</Button>
						<Button
							variant="outline"
							size="icon-sm"
							disabled={!scroll.canRight}
							aria-label="Later stages"
							onClick={() => scroll.by(1)}
						>
							<Icon icon={ChevronRight} />
						</Button>
					</div>
				) : null}
			</div>

			{/* Whole columns per view (1 to 4, by width), snapped, so a column is
			    never left half off the edge; the buttons above say there is more. */}
			<div className="@container">
				<div
					ref={scroll.ref}
					onScroll={scroll.update}
					data-slot="deals-board"
					className="grid snap-x snap-mandatory auto-cols-[100%] grid-flow-col items-start gap-3 overflow-x-auto overscroll-x-contain pb-2 @2xl:auto-cols-[calc((100%-0.75rem)/2)] @4xl:auto-cols-[calc((100%-1.5rem)/3)] @6xl:auto-cols-[calc((100%-2.25rem)/4)]"
				>
					{columns.map((column) => (
						<Card
							key={column.stage}
							data-slot="deals-board-column"
							aria-label={LABELS.get(column.stage)}
							className="min-w-0 snap-start"
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

							{/* Grows with its cards rather than clipping them. */}
							<CardPanel
								size="content"
								className="max-h-none bg-muted sm:max-h-none"
							>
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
		</div>
	);
}

function useBoardScroll() {
	const ref = useRef<HTMLDivElement>(null);
	const [edges, setEdges] = useState({ canLeft: false, canRight: false });

	const update = useCallback(() => {
		const board = ref.current;
		if (!board) return;
		const canLeft = board.scrollLeft > 1;
		const canRight =
			board.scrollLeft + board.clientWidth < board.scrollWidth - 1;
		setEdges((current) =>
			current.canLeft === canLeft && current.canRight === canRight
				? current
				: { canLeft, canRight },
		);
	}, []);

	useEffect(() => {
		const board = ref.current;
		if (!board) return;
		update();
		const observer = new ResizeObserver(update);
		observer.observe(board);
		return () => observer.disconnect();
	}, [update]);

	const by = (direction: -1 | 1) => {
		const board = ref.current;
		const column = board?.firstElementChild;
		if (!board || !column) return;
		const gap = Number.parseFloat(getComputedStyle(board).columnGap) || 0;
		board.scrollBy({
			left: direction * (column.getBoundingClientRect().width + gap),
			behavior: "smooth",
		});
	};

	return { ref, update, by, ...edges };
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

	// A white card on the muted column, so the company's initials tile and
	// the amount read clearly; the stage arrows share the amount's row.
	return (
		<CardPanelDetail
			className="shrink-0 gap-1.5 border bg-background text-foreground"
			draggable={!pending}
			onDragStart={(event) => {
				event.dataTransfer.setData(DRAG_TYPE, deal.id);
				event.dataTransfer.effectAllowed = "move";
			}}
		>
			<button
				type="button"
				onClick={onOpen}
				className="flex min-w-0 flex-col gap-1 text-left"
			>
				<span className="truncate font-medium">{deal.name}</span>
				<CompanyCell company={deal.company} />
			</button>

			<div className="flex items-center gap-2">
				<span className="min-w-0 flex-1 truncate font-medium tabular-nums">
					{deal.amountCents === null
						? null
						: formatMoney(deal.amountCents, deal.currency)}
				</span>
				{previous === null ? null : (
					<Button
						variant="ghost"
						size="icon-xs"
						disabled={pending}
						aria-label={`Move to ${LABELS.get(previous)}`}
						onClick={() => onMove(previous)}
					>
						<Icon icon={ChevronLeft} />
					</Button>
				)}
				{next === null ? null : (
					<Button
						variant="ghost"
						size="icon-xs"
						disabled={pending}
						aria-label={`Move to ${LABELS.get(next)}`}
						onClick={() => onMove(next)}
					>
						<Icon icon={ChevronRight} />
					</Button>
				)}
			</div>
		</CardPanelDetail>
	);
}

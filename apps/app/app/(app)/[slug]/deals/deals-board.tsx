"use client";

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
import {
	EntityLogo,
	type EntityLogoTone,
} from "@crm/ui/components/entity-logo";
import { Icon } from "@crm/ui/components/icon";
import {
	formatCount,
	formatMoney,
	formatMoneyCompact,
} from "@crm/ui/lib/format";
import { cn } from "@crm/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useQueryStates } from "nuqs";
import {
	type DragEvent,
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useOpenRecord } from "@/components/crm/record-sheet/record-stack";
import {
	closeReasonParams,
	useStageMutation,
} from "@/components/crm/stage-change";
import { useTableQuery } from "@/components/data-table/use-table-query";
import {
	DEAL_STAGE_OPTIONS,
	dealStageColor,
	isClosedStage,
	LOSING_STAGES,
} from "@/lib/deal-stage";
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
	const currency = deals.data?.reportingCurrency ?? "usd";
	const byId = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
	const columns = useMemo(() => groupByStage(STAGES, rows), [rows]);
	const open = columns.filter((column) => !isClosedStage(column.stage));
	const closed = columns.filter((column) => isClosedStage(column.stage));

	const renderColumn = (
		column: (typeof columns)[number],
		className?: string,
	) => (
		<BoardColumn
			key={column.stage}
			stage={column.stage}
			deals={column.deals}
			currency={currency}
			className={className}
			onDrop={(event) => {
				event.preventDefault();
				const deal = byId.get(event.dataTransfer.getData(DRAG_TYPE));
				if (deal) move(deal, column.stage);
			}}
		>
			{column.deals.map((deal) => (
				<DealCard
					key={deal.id}
					deal={deal}
					pending={pending}
					onOpen={() => openRecord({ kind: "deal", id: deal.id })}
					onMove={(stage) => move(deal, stage)}
				/>
			))}
		</BoardColumn>
	);

	return (
		<div className="flex min-h-0 flex-col gap-3">
			{total > rows.length || scroll.canLeft || scroll.canRight ? (
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
								<Icon icon={ChevronLeftIcon} />
							</Button>
							<Button
								variant="outline"
								size="icon-sm"
								disabled={!scroll.canRight}
								aria-label="Later stages"
								onClick={() => scroll.by(1)}
							>
								<Icon icon={ChevronRightIcon} />
							</Button>
						</div>
					) : null}
				</div>
			) : null}

			{/* The open stages: all four side by side on a wide screen; whole,
			    snapped columns (1 to 3, by width) on narrower ones, with the
			    buttons above saying there is more. */}
			<div className="@container">
				<div
					ref={scroll.ref}
					onScroll={scroll.update}
					data-slot="deals-board"
					className="grid snap-x snap-mandatory auto-cols-[100%] grid-flow-col items-start gap-3 overflow-x-auto overscroll-x-contain pb-2 @2xl:auto-cols-[calc((100%-0.75rem)/2)] @4xl:auto-cols-[calc((100%-1.5rem)/3)] @6xl:auto-cols-[calc((100%-2.25rem)/4)]"
				>
					{open.map((column) => renderColumn(column, "snap-start"))}
				</div>
			</div>

			{/* The closed stages stay in view as a row of lanes below. */}
			<section
				aria-label="Closed"
				className="@container flex flex-col gap-2 pt-4"
			>
				<h2 className="text-muted-foreground text-sm">Closed</h2>
				<div className="grid items-start gap-3 @2xl:grid-cols-3">
					{closed.map((column) => renderColumn(column))}
				</div>
			</section>
		</div>
	);
}

function BoardColumn({
	stage,
	deals,
	currency,
	className,
	onDrop,
	children,
}: {
	stage: DealStage;
	deals: DealRow[];
	currency: string;
	className?: string;
	onDrop: (event: DragEvent<HTMLDivElement>) => void;
	children: ReactNode;
}) {
	// The stage's worth in the reporting currency, like the overview's donut.
	const value = deals.reduce(
		(sum, deal) => sum + (deal.baseAmountCents ?? 0),
		0,
	);

	return (
		<Card
			data-slot="deals-board-column"
			aria-label={LABELS.get(stage)}
			className={cn("min-w-0", className)}
			onDragOver={(event) => {
				if (event.dataTransfer.types.includes(DRAG_TYPE)) {
					event.preventDefault();
				}
			}}
			onDrop={onDrop}
		>
			<CardHeader>
				<CardTitle className="flex min-w-0 items-center gap-2">
					<span
						aria-hidden
						className="size-2 shrink-0 rounded-full"
						style={{ backgroundColor: dealStageColor(stage) }}
					/>
					<span className="truncate">{LABELS.get(stage)}</span>
				</CardTitle>
				<CardAction className="flex items-baseline gap-2 text-sm tabular-nums">
					<span className="text-muted-foreground text-xs">
						{formatCount(deals.length, "deal")}
					</span>
					{value > 0 ? (
						<span className="font-medium">
							{formatMoneyCompact(value, currency)}
						</span>
					) : null}
				</CardAction>
			</CardHeader>

			{/* Grows with its cards rather than clipping them. */}
			<CardPanel size="content" className="max-h-none bg-muted sm:max-h-none">
				{deals.length === 0 ? (
					<CardPanelEmpty>No deals</CardPanelEmpty>
				) : (
					<CardPanelScroll className="gap-2 p-2">{children}</CardPanelScroll>
				)}
			</CardPanel>
		</Card>
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
		const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
		board.scrollBy({
			left: direction * (column.getBoundingClientRect().width + gap),
			behavior: still ? "auto" : "smooth",
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

	const company = deal.company;
	// The company only gets its own line when the deal's name doesn't say it.
	const named = deal.name.toLowerCase().includes(company.name.toLowerCase());

	// The logo, the name and the amount; the stage arrows only show on hover
	// or keyboard focus where there is a pointer that hovers.
	return (
		<CardPanelDetail
			className="group/deal shrink-0 gap-2 border bg-background text-foreground"
			draggable={!pending}
			onDragStart={(event) => {
				event.dataTransfer.setData(DRAG_TYPE, deal.id);
				event.dataTransfer.effectAllowed = "move";
			}}
		>
			<button
				type="button"
				onClick={onOpen}
				className="flex min-w-0 items-center gap-2 text-left"
			>
				<EntityLogo
					src={company.iconUrl ?? company.logoUrl}
					darkSrc={company.iconDarkUrl}
					tone={company.iconTone as EntityLogoTone | null | undefined}
					name={company.name}
					size="sm"
				/>
				<span className="flex min-w-0 flex-col">
					<span className="truncate font-medium">{deal.name}</span>
					{named ? null : (
						<span className="truncate text-muted-foreground text-xs">
							{company.name}
						</span>
					)}
				</span>
			</button>

			<div className="flex h-6 items-center gap-1">
				<span className="min-w-0 flex-1 truncate font-medium text-sm tabular-nums">
					{deal.amountCents === null
						? null
						: formatMoney(
								Math.round(deal.amountCents / 100) * 100,
								deal.currency,
							)}
				</span>
				<span className="flex items-center gap-1 transition-opacity duration-150 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within/deal:opacity-100 [@media(hover:hover)]:group-hover/deal:opacity-100">
					{previous === null ? null : (
						<Button
							variant="ghost"
							size="icon-xs"
							disabled={pending}
							aria-label={`Move to ${LABELS.get(previous)}`}
							onClick={() => onMove(previous)}
						>
							<Icon icon={ChevronLeftIcon} />
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
							<Icon icon={ChevronRightIcon} />
						</Button>
					)}
				</span>
			</div>
		</CardPanelDetail>
	);
}

export type BoardColumn<TStage extends string, TDeal> = {
	stage: TStage;
	deals: TDeal[];
};

export function groupByStage<
	TStage extends string,
	TDeal extends { stage: TStage },
>(
	stages: readonly TStage[],
	deals: readonly TDeal[],
): BoardColumn<TStage, TDeal>[] {
	const columns = new Map<TStage, TDeal[]>(stages.map((stage) => [stage, []]));

	for (const deal of deals) {
		columns.get(deal.stage)?.push(deal);
	}

	return stages.map((stage) => ({ stage, deals: columns.get(stage) ?? [] }));
}

export function adjacentStage<TStage extends string>(
	stages: readonly TStage[],
	current: TStage,
	step: -1 | 1,
): TStage | null {
	const index = stages.indexOf(current);
	if (index === -1) return null;
	return stages[index + step] ?? null;
}

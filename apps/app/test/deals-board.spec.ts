import { describe, expect, it } from "bun:test";
import {
	adjacentStage,
	groupByStage,
} from "../app/(app)/[slug]/deals/deals-board-model";
import {
	boardListInput,
	DEALS_BOARD,
	loadDealsLayout,
} from "../app/(app)/[slug]/deals/deals-layout";
import { dealsSearchParams } from "../app/(app)/[slug]/deals/deals-search-params";
import { SEARCH_PARAM } from "../lib/search-param-keys";

describe("board prefetch", () => {
	it("reads the layout from the URL, defaulting to the table", () => {
		const key = SEARCH_PARAM.deals.layout;

		expect(loadDealsLayout(`?${key}=board`)[key]).toBe("board");
		expect(loadDealsLayout("")[key]).toBe("table");
		expect(loadDealsLayout(`?${key}=kanban`)[key]).toBe("table");
	});

	it("asks for the first page up to the board cap, keeping the filters", () => {
		const input = { ...dealsSearchParams.defaultInput(), page: 3, q: "acme" };

		expect(boardListInput(input)).toEqual({
			...input,
			page: 1,
			pageSize: DEALS_BOARD.pageSize,
		});
		expect(DEALS_BOARD.pageSize).toBe(100);
	});
});

const STAGES = ["DEMO_BOOKED", "CONTRACT_SENT", "CLOSED_WON"] as const;

describe("groupByStage", () => {
	it("keeps every stage as a column, in order, even when empty", () => {
		const columns = groupByStage(STAGES, [
			{ id: "a", stage: "CLOSED_WON" as const },
			{ id: "b", stage: "DEMO_BOOKED" as const },
			{ id: "c", stage: "CLOSED_WON" as const },
		]);

		expect(columns.map((column) => column.stage)).toEqual([...STAGES]);
		expect(
			columns.map((column) => column.deals.map((deal) => deal.id)),
		).toEqual([["b"], [], ["a", "c"]]);
	});
});

describe("adjacentStage", () => {
	it("steps left and right and stops at the ends", () => {
		expect(adjacentStage(STAGES, "CONTRACT_SENT", -1)).toBe("DEMO_BOOKED");
		expect(adjacentStage(STAGES, "CONTRACT_SENT", 1)).toBe("CLOSED_WON");
		expect(adjacentStage(STAGES, "DEMO_BOOKED", -1)).toBeNull();
		expect(adjacentStage(STAGES, "CLOSED_WON", 1)).toBeNull();
	});
});

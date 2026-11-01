import { describe, expect, it } from "bun:test";
import {
	adjacentStage,
	groupByStage,
} from "../app/(app)/[slug]/deals/deals-board-model";

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

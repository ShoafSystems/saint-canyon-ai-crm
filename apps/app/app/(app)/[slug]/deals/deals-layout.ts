import { createLoader, parseAsStringLiteral } from "nuqs/server";
import { SEARCH_PARAM } from "@/lib/search-param-keys";

export const DEALS_LAYOUTS = ["table", "board"] as const;

export type DealsLayout = (typeof DEALS_LAYOUTS)[number];

export const DEALS_BOARD = {
	pageSize: 100,
} as const;

export const dealsLayoutParams = {
	[SEARCH_PARAM.deals.layout]:
		parseAsStringLiteral(DEALS_LAYOUTS).withDefault("table"),
};

export const loadDealsLayout = createLoader(dealsLayoutParams);

/**
 * The board's one query: the list filters, first page, up to the board cap.
 * The page prefetches with this too, so both must build the same key.
 */
export function boardListInput<TInput extends object>(
	input: TInput,
): TInput & { page: 1; pageSize: number } {
	return { ...input, page: 1, pageSize: DEALS_BOARD.pageSize };
}

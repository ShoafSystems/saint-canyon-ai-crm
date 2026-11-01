import { parseAsStringLiteral } from "nuqs";
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

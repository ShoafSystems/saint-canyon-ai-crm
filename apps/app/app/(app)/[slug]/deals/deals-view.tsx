"use client";

import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import { DealsBoard } from "./deals-board";
import { dealsLayoutParams } from "./deals-layout";
import { DealsTable } from "./deals-table";

export function DealsView() {
	const [values] = useQueryStates(dealsLayoutParams);

	return values[SEARCH_PARAM.deals.layout] === "board" ? (
		<DealsBoard />
	) : (
		<DealsTable />
	);
}

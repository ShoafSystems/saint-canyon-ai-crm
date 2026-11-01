"use client";

import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useQueryStates } from "nuqs";
import { SEARCH_PARAM } from "@/lib/search-param-keys";
import {
	DEALS_LAYOUTS,
	type DealsLayout,
	dealsLayoutParams,
} from "./deals-layout";

const LABELS: Record<DealsLayout, string> = {
	table: "Table",
	board: "Board",
};

export function DealsLayoutToggle() {
	const [values, setValues] = useQueryStates(dealsLayoutParams);
	const layout = values[SEARCH_PARAM.deals.layout];

	return (
		<ToggleGroup
			type="single"
			value={layout}
			onValueChange={(next) => {
				const chosen = DEALS_LAYOUTS.find((option) => option === next);
				if (chosen) void setValues({ [SEARCH_PARAM.deals.layout]: chosen });
			}}
			size="sm"
			spacing={0}
			aria-label="Deals layout"
		>
			{DEALS_LAYOUTS.map((option) => (
				<ToggleGroupItem key={option} value={option}>
					{LABELS[option]}
				</ToggleGroupItem>
			))}
		</ToggleGroup>
	);
}

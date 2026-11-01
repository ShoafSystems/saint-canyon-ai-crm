"use client";

import { ToggleGroup, ToggleGroupItem } from "@crm/ui/components/toggle-group";
import { useQueryStates } from "nuqs";
import { Suspense } from "react";
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

// The layout lives in the URL, which is only known at request time, so the
// toggle streams in under Suspense; prerendering it blocks `next build`.
export function DealsLayoutToggle() {
	return (
		<Suspense fallback={<LayoutToggleGroup disabled />}>
			<DealsLayoutToggleControl />
		</Suspense>
	);
}

function DealsLayoutToggleControl() {
	const [values, setValues] = useQueryStates(dealsLayoutParams);

	return (
		<LayoutToggleGroup
			value={values[SEARCH_PARAM.deals.layout]}
			onValueChange={(next) => {
				const chosen = DEALS_LAYOUTS.find((option) => option === next);
				if (chosen) void setValues({ [SEARCH_PARAM.deals.layout]: chosen });
			}}
		/>
	);
}

function LayoutToggleGroup({
	value,
	onValueChange,
	disabled,
}: {
	value?: DealsLayout;
	onValueChange?: (next: string) => void;
	disabled?: boolean;
}) {
	return (
		<ToggleGroup
			type="single"
			value={value}
			onValueChange={onValueChange}
			disabled={disabled}
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

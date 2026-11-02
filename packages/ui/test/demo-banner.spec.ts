import { expect, test } from "bun:test";
import {
	DEMO_BANNER_LINES,
	DEMO_BANNER_TEXT,
	DEMO_BANNER_TITLE,
	DemoBanner,
} from "@crm/ui/components/demo-banner";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

test("tells visitors the demo is shared and not for real information", () => {
	expect(DEMO_BANNER_TEXT).toBe(
		"Public demo Sample data, shared with every visitor. Anything you type is visible to others. Do not enter real information.",
	);

	for (const variant of ["strip", "card"] as const) {
		const markup = renderToStaticMarkup(createElement(DemoBanner, { variant }));
		expect(markup).toContain('role="note"');
		expect(markup).toContain(`<strong`);
		expect(markup).toContain(DEMO_BANNER_TITLE);
		for (const line of DEMO_BANNER_LINES) expect(markup).toContain(line);
	}
});

test("renders the same markup every time, so hydration cannot differ", () => {
	for (const variant of ["strip", "card"] as const) {
		expect(renderToString(createElement(DemoBanner, { variant }))).toBe(
			renderToString(createElement(DemoBanner, { variant })),
		);
	}
});

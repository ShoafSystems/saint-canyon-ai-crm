import { expect, test } from "bun:test";
import { DEMO_BANNER_TEXT, DemoBanner } from "@crm/ui/components/demo-banner";
import { createElement } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";

test("tells visitors the demo is shared and not for real information", () => {
	const markup = renderToStaticMarkup(createElement(DemoBanner));

	expect(markup).toContain('role="note"');
	expect(DEMO_BANNER_TEXT).toBe(
		"Shared public demo · sample data only · everything you type is visible to other visitors · do not enter real information",
	);
	expect(markup).toContain(DEMO_BANNER_TEXT);
});

test("renders the same markup every time, so hydration cannot differ", () => {
	expect(renderToString(createElement(DemoBanner))).toBe(
		renderToString(createElement(DemoBanner)),
	);
});

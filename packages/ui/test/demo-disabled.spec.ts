import { expect, test } from "bun:test";
import { DemoDisabled } from "@crm/ui/components/demo-disabled";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const action = createElement("button", { type: "button" }, "Create API key");

test("disables the wrapped action and says why for the demo user", () => {
	const markup = renderToStaticMarkup(
		createElement(DemoDisabled, { active: true }, action),
	);

	expect(markup).toContain("<fieldset disabled");
	expect(markup).toContain("Create API key");
	expect(markup).toContain("Disabled in demo");
});

test("can put the note before a page of controls", () => {
	const markup = renderToStaticMarkup(
		createElement(DemoDisabled, { active: true, noteFirst: true }, action),
	);

	expect(markup.indexOf("Disabled in demo")).toBeLessThan(
		markup.indexOf("Create API key"),
	);
});

test("renders the action untouched for everyone else", () => {
	const markup = renderToStaticMarkup(
		createElement(DemoDisabled, { active: false }, action),
	);

	expect(markup).toBe('<button type="button">Create API key</button>');
});

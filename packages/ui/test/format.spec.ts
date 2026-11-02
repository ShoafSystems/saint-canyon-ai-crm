import { expect, test } from "bun:test";
import { formatMoney, formatMoneyCompact } from "@crm/ui/lib/format";

// The server and the visitor's browser must print the same text, whatever
// either one's default locale is, or React fails hydration (#418).
test("money is formatted in one fixed locale", () => {
	const intl = Intl.NumberFormat;
	const seen: (string | string[] | undefined)[] = [];
	Intl.NumberFormat = function (
		locales?: string | string[],
		options?: Intl.NumberFormatOptions,
	) {
		seen.push(locales);
		return new intl(locales ?? "de-DE", options);
	} as unknown as typeof Intl.NumberFormat;

	try {
		expect(formatMoney(123_456, "usd")).toBe("$1,234.56");
		expect(formatMoney(5_000_000, "eur")).toBe("€50,000");
		expect(formatMoneyCompact(250_050_000, "usd")).toBe("$2.5M");
	} finally {
		Intl.NumberFormat = intl;
	}

	expect(seen.every((locales) => locales === "en-US")).toBe(true);
});

// Node resolves a compact currency minimum of 1 fraction digit where Chromium
// and Bun resolve 0, so the server printed "$405.0K" and the browser "$405K"
// on the overview's Open pipeline card. Any fraction maximum must come with an
// explicit minimum, whichever engine runs this test.
test("compact money never leaves the fraction minimum to the engine", () => {
	const intl = Intl.NumberFormat;
	const seen: Intl.NumberFormatOptions[] = [];
	Intl.NumberFormat = function (
		locales?: string | string[],
		options?: Intl.NumberFormatOptions,
	) {
		seen.push(options ?? {});
		return new intl(locales, options);
	} as unknown as typeof Intl.NumberFormat;

	try {
		expect(formatMoneyCompact(40_500_000, "usd")).toBe("$405K");
		expect(formatMoneyCompact(40_512_300, "usd")).toBe("$405.1K");
		expect(formatMoneyCompact(6_300_000, "usd")).toBe("$63K");
	} finally {
		Intl.NumberFormat = intl;
	}

	for (const options of seen) {
		expect(options.minimumFractionDigits).toBe(0);
	}
});

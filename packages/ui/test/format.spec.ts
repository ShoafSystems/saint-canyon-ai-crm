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

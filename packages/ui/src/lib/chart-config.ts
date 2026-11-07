export type ChartColor = { light: string; dark: string };

// Dark is the glass theme: muted data hues, one per open stage (blue-grey,
// sage, sand, dusk), and slate and white for the trend so neither series
// borrows a stage colour.
const COLORS = {
	foreground: { light: "#18181b", dark: "#f4f4f6" },
	slate: { light: "#71717a", dark: "#8d939d" },
	stage1: { light: "#a7f3d0", dark: "#8fa6c6" },
	stage2: { light: "#6ee7b7", dark: "#9cb39a" },
	stage3: { light: "#10b981", dark: "#c8b290" },
	stage4: { light: "#047857", dark: "#a69dbb" },
} as const satisfies Record<string, ChartColor>;

export const CHART_CONFIG = {
	trend: {
		won: COLORS.foreground,
		created: COLORS.slate,
	},
	stages: [COLORS.stage1, COLORS.stage2, COLORS.stage3, COLORS.stage4],
	fallback: COLORS.slate,
	height: {
		area: 200,
		bar: 180,
		donut: 200,
		dashboardTrend: 196,
		dashboardDonut: 168,
	},
	area: {
		curve: "monotone",
		stroke: "solid",
		strokeWidth: 1.5,
	},
	bar: {
		radius: 4,
	},
	donut: {
		innerRadius: "72%",
		outerRadius: "100%",
		cornerRadius: 4,
		paddingAngle: 2,
	},
} as const satisfies {
	trend: Record<string, ChartColor>;
	stages: readonly ChartColor[];
	fallback: ChartColor;
	height: Record<string, number>;
	area: { curve: string; stroke: string; strokeWidth: number };
	bar: { radius: number };
	donut: {
		innerRadius: string;
		outerRadius: string;
		cornerRadius: number;
		paddingAngle: number;
	};
};

export function chartSwatch(color: ChartColor): string {
	return `light-dark(${color.light}, ${color.dark})`;
}

export function chartThemeColors(color: ChartColor) {
	return { light: [color.light], dark: [color.dark] };
}

export function stageChartColor(index: number): ChartColor {
	return CHART_CONFIG.stages[index] ?? CHART_CONFIG.fallback;
}

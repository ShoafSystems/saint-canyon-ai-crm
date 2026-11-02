import type { DealStage } from "@crm/db/enums";
import { StatusIndicator } from "@crm/ui/components/status-indicator";
import {
	dealStageColor,
	dealStagePresentation,
	isClosedStage,
} from "@/lib/deal-stage";

// Open stages take their chart colour, so the dot matches the donut, the
// board and the value bars; closed stages keep their outcome tone.
export function DealStageIndicator({
	stage,
	className,
}: {
	stage: DealStage;
	className?: string;
}) {
	const { label, tone } = dealStagePresentation(stage);
	return (
		<StatusIndicator
			tone={tone}
			color={isClosedStage(stage) ? undefined : dealStageColor(stage)}
			label={label}
			className={className}
		/>
	);
}

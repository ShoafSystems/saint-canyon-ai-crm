import ArrowRight from "@carbon/icons-react/es/ArrowRight";
import { Button } from "@crm/ui/components/button";

export function DemoSignIn({ action }: { action: string }) {
	return (
		<form action={action} className="w-full" method="post">
			<Button className="w-full" size="xl" type="submit">
				Enter demo
				<ArrowRight data-icon="inline-end" />
			</Button>
		</form>
	);
}

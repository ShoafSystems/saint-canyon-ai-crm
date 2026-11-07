import { Button } from "@crm/ui/components/button";
import { ArrowRightIcon } from "lucide-react";

export function DemoSignIn({ action }: { action: string }) {
	return (
		<form action={action} className="w-full" method="post">
			<Button className="w-full" size="xl" type="submit">
				Enter demo
				<ArrowRightIcon data-icon="inline-end" />
			</Button>
		</form>
	);
}

import { Button } from "@crm/ui/components/button";

export function DemoSignIn({ action }: { action: string }) {
	return (
		<form action={action} className="w-full" method="post">
			<Button className="w-full" type="submit">
				Enter demo
			</Button>
		</form>
	);
}

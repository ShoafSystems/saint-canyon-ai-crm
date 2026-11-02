import { AsyncLocalStorage } from "node:async_hooks";

// Marks work done on behalf of the shared public demo user, so code far from
// the request (the agent queue) can tell without threading a flag through
// every service. The scope follows promise continuations, including
// fire-and-forget `void` calls started inside it.
const scope = new AsyncLocalStorage<true>();

export function runAsDemoActor<Result>(work: () => Result): Result {
	return scope.run(true, work);
}

export function actingAsDemoUser(): boolean {
	return scope.getStore() === true;
}

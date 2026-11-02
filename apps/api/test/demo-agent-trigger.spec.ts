import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { db } from "@crm/db";
import { AgentTriggerService } from "../src/agent/agent-trigger.service";
import { actingAsDemoUser, runAsDemoActor } from "../src/demo/demo-actor";

const suffix = crypto.randomUUID();
const dealId = `demo-trigger-deal-${suffix}`;
const contactId = `demo-trigger-contact-${suffix}`;
const service = new AgentTriggerService(db);
let previousBridgeSecret: string | undefined;

const tasks = () =>
	db.agentTask.findMany({
		where: { OR: [{ dealId }, { contactId }] },
		select: { kind: true },
	});

beforeAll(() => {
	previousBridgeSecret = process.env.AGENT_BRIDGE_SECRET;
	delete process.env.AGENT_BRIDGE_SECRET;
});

afterAll(async () => {
	await db.agentTask.deleteMany({ where: { OR: [{ dealId }, { contactId }] } });
	if (previousBridgeSecret !== undefined) {
		process.env.AGENT_BRIDGE_SECRET = previousBridgeSecret;
	}
});

const emitDealCreated = () =>
	service.withCrmEvents(async (_tx, emit) => {
		await emit({
			type: "deal.created",
			record: { kind: "deal", id: dealId },
			occurredAt: new Date(),
			data: { stage: "DEMO_BOOKED" },
		});
	});

describe("demo actor scope", () => {
	it("is only set inside runAsDemoActor, across awaits", async () => {
		expect(actingAsDemoUser()).toBe(false);
		await runAsDemoActor(async () => {
			await Promise.resolve();
			expect(actingAsDemoUser()).toBe(true);
		});
		expect(actingAsDemoUser()).toBe(false);
	});
});

describe("agent triggers for the demo user", () => {
	it("queues no CRM event for deployed agents and no research task", async () => {
		await runAsDemoActor(async () => {
			await emitDealCreated();
			expect(await service.contactCreated(contactId, "demo probe")).toBe(false);
			expect(
				await service.backfill({
					kind: "identify",
					reason: "demo probe",
					contactIds: [contactId],
				}),
			).toEqual({ queued: 0, alreadyQueued: 0 });
		});
		expect(await tasks()).toEqual([]);
	});

	it("still queues both for everyone else", async () => {
		await emitDealCreated();
		expect(await service.contactCreated(contactId, "member probe")).toBe(true);
		const kinds = (await tasks()).map((task) => task.kind).sort();
		expect(kinds).toEqual(["agent-event", "identify"]);
	});
});

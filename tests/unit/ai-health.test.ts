import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiHealthMonitor } from "#/server/lib/ai-health";

function setup(threshold?: number) {
	let failing = false;
	const notifyDown = vi.fn(async () => {});
	const notifyRecovered = vi.fn(async () => {});
	const check = createAiHealthMonitor({
		ping: async () => {
			if (failing) throw new Error("credit balance is too low");
		},
		notifyDown,
		notifyRecovered,
		threshold,
	});
	return {
		check,
		notifyDown,
		notifyRecovered,
		setFailing: (v: boolean) => {
			failing = v;
		},
	};
}

describe("AI health monitor", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("does not alert below the failure threshold", async () => {
		const { check, notifyDown, setFailing } = setup(3);
		setFailing(true);
		await check();
		await check();
		expect(notifyDown).not.toHaveBeenCalled();
	});

	it("alerts exactly once when the threshold is reached", async () => {
		const { check, notifyDown, setFailing } = setup(3);
		setFailing(true);
		for (let i = 0; i < 5; i++) await check();
		expect(notifyDown).toHaveBeenCalledTimes(1);
		expect(notifyDown).toHaveBeenCalledWith("Error: credit balance is too low", 3);
	});

	it("resets the streak on success", async () => {
		const { check, notifyDown, setFailing } = setup(3);
		setFailing(true);
		await check();
		await check();
		setFailing(false);
		await check();
		setFailing(true);
		await check();
		await check();
		expect(notifyDown).not.toHaveBeenCalled();
	});

	it("sends a recovery notice once after an alert, then can alert again", async () => {
		const { check, notifyDown, notifyRecovered, setFailing } = setup(2);
		setFailing(true);
		await check();
		await check();
		expect(notifyDown).toHaveBeenCalledTimes(1);

		setFailing(false);
		await check();
		await check();
		expect(notifyRecovered).toHaveBeenCalledTimes(1);

		setFailing(true);
		await check();
		await check();
		expect(notifyDown).toHaveBeenCalledTimes(2);
	});

	it("never sends a recovery notice without a prior alert", async () => {
		const { check, notifyRecovered, setFailing } = setup(3);
		setFailing(true);
		await check();
		setFailing(false);
		await check();
		expect(notifyRecovered).not.toHaveBeenCalled();
	});
});

import { expect, test } from "bun:test";
import { billingEventState } from "./billing-rules";

test("classifica eventos de assinatura ativos e cancelados", () => {
  expect(billingEventState("subscription.completed")).toBe("ACTIVE");
  expect(billingEventState("subscription.renewed")).toBe("ACTIVE");
  expect(billingEventState("subscription.trial_started")).toBe("ACTIVE");
  expect(billingEventState("subscription.cancelled")).toBe("CANCELLED");
  expect(billingEventState("checkout.completed")).toBeUndefined();
});

export const activeSubscriptionEvents = new Set([
  "subscription.completed",
  "subscription.renewed",
  "subscription.trial_started",
]);

export function billingEventState(event: string) {
  if (activeSubscriptionEvents.has(event)) return "ACTIVE" as const;
  if (event === "subscription.cancelled") return "CANCELLED" as const;
  return undefined;
}

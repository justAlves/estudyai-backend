export type ProductPlan = "FREE" | "PRO";
export type UsageKind = "SIMULATION" | "ESSAY";

export const monthlyLimits: Record<ProductPlan, Record<UsageKind, number>> = {
  FREE: { SIMULATION: 2, ESSAY: 1 },
  PRO: { SIMULATION: 20, ESSAY: 8 },
};

export function monthlyUsageKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function canConsumeMonthlyUsage(plan: ProductPlan, kind: UsageKind, used: number) {
  return used >= 0 && used < monthlyLimits[plan][kind];
}

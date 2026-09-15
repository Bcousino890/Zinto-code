/**
 * Pure helpers for the admin "Compare Plans" view. Kept dependency-free (no
 * React, no i18n) so the row-building logic can be unit tested directly with
 * `node --test`, separate from the table markup in index.tsx.
 */

export interface PlanPriceLike {
  price: number | string;
}

/**
 * Sorts plans from highest price to lowest. Mirrors the ordering used by
 * `useAvailablePlans` (client/src/hooks/use-available-plans.ts) so the admin
 * comparison view lines up with the customer-facing plan list. Returns a new
 * array; the input is not mutated.
 */
export function sortPlansByPriceDescending<T extends PlanPriceLike>(plans: T[]): T[] {
  return [...plans].sort((a, b) => Number(b.price) - Number(a.price));
}

export interface PlanFeatureListLike {
  id: number;
  features?: string[] | null;
  campaignFeatures?: string[] | null;
}

export type PlanFeatureListKey = "features" | "campaignFeatures";

export interface FeatureComparisonRow {
  /** Trimmed feature text, taken from the first plan that listed it. */
  label: string;
  /** Plan id -> whether that plan includes this feature. Absent = not included. */
  includedByPlanId: Record<number, boolean>;
}

/**
 * Builds the union of every distinct feature line item across all plans, in
 * first-seen order, so a feature shared by several plans becomes a single
 * row instead of repeating once per plan. Blank/whitespace-only entries are
 * skipped. `listKey` selects which of the plan's feature lists to read
 * (`features` for the general feature list, `campaignFeatures` for the
 * campaign-specific one), so the same helper builds both sections of the
 * comparison table.
 */
export function buildFeatureComparisonRows(
  plans: PlanFeatureListLike[],
  listKey: PlanFeatureListKey = "features"
): FeatureComparisonRow[] {
  const rows: FeatureComparisonRow[] = [];
  const rowIndexByLabel = new Map<string, number>();

  for (const plan of plans) {
    const list = listKey === "features" ? plan.features : plan.campaignFeatures;
    for (const rawEntry of list ?? []) {
      const label = (rawEntry ?? "").trim();
      if (!label) continue;

      let rowIndex = rowIndexByLabel.get(label);
      if (rowIndex === undefined) {
        rowIndex = rows.length;
        rowIndexByLabel.set(label, rowIndex);
        rows.push({ label, includedByPlanId: {} });
      }
      rows[rowIndex].includedByPlanId[plan.id] = true;
    }
  }

  return rows;
}

import { createHash } from 'node:crypto';
import type Stripe from 'stripe';

type MonetaryAmount = string | number;
type DiscountType = 'none' | 'percentage' | 'fixed_amount';
type DateLike = Date | string | number;

export interface PlanLike {
  id?: number;
  price: MonetaryAmount;
  originalPrice?: MonetaryAmount | null;
  discountType?: DiscountType | null;
  discountValue?: MonetaryAmount | null;
  discountStartDate?: DateLike | null;
  discountEndDate?: DateLike | null;
}

export interface CouponLike {
  discountType: Exclude<DiscountType, 'none'>;
  discountValue: MonetaryAmount;
  isActive?: boolean | null;
  startDate?: DateLike | null;
  endDate?: DateLike | null;
  usageLimit?: number | null;
  currentUsageCount?: number | null;
  applicablePlanIds?: number[] | null;
  minimumPlanValue?: MonetaryAmount | null;
}

export interface DiscountDecision {
  source: 'none' | 'plan' | 'coupon';
  originalAmount: number;
  discountAmount: number;
  finalAmount: number;
}

const ZERO_DECIMAL_CURRENCIES = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'UGX',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
]);

const FIXED_INTERVALS: Record<string, Stripe.PriceCreateParams.Recurring | null> = {
  lifetime: null,
  daily: { interval: 'day', interval_count: 1 },
  weekly: { interval: 'week', interval_count: 1 },
  biweekly: { interval: 'week', interval_count: 2 },
  monthly: { interval: 'month', interval_count: 1 },
  quarterly: { interval: 'month', interval_count: 3 },
  semi_annual: { interval: 'month', interval_count: 6 },
  annual: { interval: 'year', interval_count: 1 },
  biennial: { interval: 'year', interval_count: 2 },
};

const MAX_CUSTOM_DURATION_DAYS = 3 * 365;

export function toMinorUnits(amount: string | number, currency: string): number {
  const exponent = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) throw new Error('Invalid monetary amount');
  return Math.round(Number(normalized) * 10 ** exponent);
}

export function mapBillingInterval(
  interval: string,
  customDays?: number | null,
): Stripe.PriceCreateParams.Recurring | null {
  if (Object.prototype.hasOwnProperty.call(FIXED_INTERVALS, interval)) {
    const recurring = FIXED_INTERVALS[interval];
    return recurring == null ? null : { ...recurring };
  }

  if (interval !== 'custom') {
    throw new Error(`Unsupported billing interval: ${interval}`);
  }

  if (
    customDays == null ||
    !Number.isSafeInteger(customDays) ||
    customDays < 1 ||
    customDays > MAX_CUSTOM_DURATION_DAYS
  ) {
    throw new Error('Invalid custom billing interval');
  }

  if (customDays % 365 === 0) {
    return { interval: 'year', interval_count: customDays / 365 };
  }
  if (customDays % 30 === 0) {
    return { interval: 'month', interval_count: customDays / 30 };
  }
  if (customDays % 7 === 0) {
    return { interval: 'week', interval_count: customDays / 7 };
  }
  return { interval: 'day', interval_count: customDays };
}

export function chooseBestDiscount(
  plan: PlanLike,
  coupon?: CouponLike | null,
  now = new Date(),
): DiscountDecision {
  const planDiscountActive = isPlanDiscountActive(plan, now);
  const originalMinorUnits = toCurrencyMinorUnits(
    planDiscountActive && plan.originalPrice != null ? plan.originalPrice : plan.price,
  );
  const originalAmount = fromCurrencyMinorUnits(originalMinorUnits);
  const noDiscount: DiscountDecision = {
    source: 'none',
    originalAmount,
    discountAmount: 0,
    finalAmount: originalAmount,
  };

  const planDecision = planDiscountActive
    ? decisionFor('plan', originalMinorUnits, plan.discountType!, plan.discountValue!)
    : noDiscount;
  const couponDecision = isCouponValid(coupon, plan, originalMinorUnits, now)
    ? decisionFor('coupon', originalMinorUnits, coupon.discountType, coupon.discountValue)
    : noDiscount;

  return couponDecision.finalAmount < planDecision.finalAmount ? couponDecision : planDecision;
}

export function catalogFingerprint(value: unknown): string {
  return createHash('sha256').update(canonicalize(value)).digest('hex');
}

function parseDecimal(amount: MonetaryAmount): { coefficient: bigint; scale: number } {
  const normalized = String(amount).trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error('Invalid monetary amount');
  }

  const [whole, fraction = ''] = normalized.split('.');
  return {
    coefficient: BigInt(`${whole}${fraction}`),
    scale: fraction.length,
  };
}

function toCurrencyMinorUnits(amount: MonetaryAmount): bigint {
  const decimal = parseDecimal(amount);
  const centsScale = 2;
  if (decimal.scale <= centsScale) {
    return decimal.coefficient * 10n ** BigInt(centsScale - decimal.scale);
  }

  return divideAndRoundHalfUp(decimal.coefficient, 10n ** BigInt(decimal.scale - centsScale));
}

function fromCurrencyMinorUnits(amount: bigint): number {
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Monetary amount exceeds safe range');
  }
  return Number(amount) / 100;
}

function isPlanDiscountActive(
  plan: PlanLike,
  now: Date,
): plan is PlanLike & {
  discountType: Exclude<DiscountType, 'none'>;
  discountValue: MonetaryAmount;
} {
  return (
    plan.discountType != null &&
    plan.discountType !== 'none' &&
    plan.discountValue != null &&
    isWithinDateRange(plan.discountStartDate, plan.discountEndDate, now)
  );
}

function isCouponValid(
  coupon: CouponLike | null | undefined,
  plan: PlanLike,
  amount: bigint,
  now: Date,
): coupon is CouponLike {
  if (!coupon || coupon.isActive === false || !isWithinDateRange(coupon.startDate, coupon.endDate, now)) {
    return false;
  }
  if (
    coupon.usageLimit != null &&
    (coupon.currentUsageCount ?? 0) >= coupon.usageLimit
  ) {
    return false;
  }
  if (
    coupon.applicablePlanIds != null &&
    coupon.applicablePlanIds.length > 0 &&
    (plan.id == null || !coupon.applicablePlanIds.includes(plan.id))
  ) {
    return false;
  }
  return coupon.minimumPlanValue == null || amount >= toCurrencyMinorUnits(coupon.minimumPlanValue);
}

function isWithinDateRange(start: DateLike | null | undefined, end: DateLike | null | undefined, now: Date): boolean {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return false;

  const startMs = start == null ? null : new Date(start).getTime();
  const endMs = end == null ? null : new Date(end).getTime();
  return (
    (startMs == null || (Number.isFinite(startMs) && nowMs >= startMs)) &&
    (endMs == null || (Number.isFinite(endMs) && nowMs <= endMs))
  );
}

function decisionFor(
  source: Exclude<DiscountDecision['source'], 'none'>,
  originalMinorUnits: bigint,
  discountType: Exclude<DiscountType, 'none'>,
  discountValue: MonetaryAmount,
): DiscountDecision {
  const discountMinorUnits =
    discountType === 'percentage'
      ? percentageOf(originalMinorUnits, discountValue)
      : toCurrencyMinorUnits(discountValue);
  const appliedDiscountMinorUnits =
    discountMinorUnits > originalMinorUnits ? originalMinorUnits : discountMinorUnits;
  return {
    source,
    originalAmount: fromCurrencyMinorUnits(originalMinorUnits),
    discountAmount: fromCurrencyMinorUnits(appliedDiscountMinorUnits),
    finalAmount: fromCurrencyMinorUnits(originalMinorUnits - appliedDiscountMinorUnits),
  };
}

function percentageOf(amount: bigint, percentage: MonetaryAmount): bigint {
  const decimal = parseDecimal(percentage);
  const denominator = 100n * 10n ** BigInt(decimal.scale);
  return divideAndRoundHalfUp(amount * decimal.coefficient, denominator);
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}

function canonicalize(value: unknown, seen = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string') {
    return `string:${JSON.stringify(value)}`;
  }
  if (typeof value === 'boolean') {
    return `boolean:${value}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot fingerprint non-finite numbers');
    return `number:${JSON.stringify(value)}`;
  }
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('Cannot fingerprint invalid dates');
    return `date:${JSON.stringify(value.toISOString())}`;
  }
  if (typeof value !== 'object') {
    throw new Error(`Unsupported catalog fingerprint value: ${typeof value}`);
  }
  if (seen.has(value)) throw new Error('Cannot fingerprint circular structures');

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new Error('Sparse arrays are not supported in catalog fingerprints');
        }
      }
      return `array:[${value.map((entry) => canonicalize(entry, seen)).join(',')}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(`Unsupported catalog fingerprint value: ${value.constructor?.name ?? 'object'}`);
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry, seen)}`);
    return `object:{${entries.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

/** Shared invoice discount calculations for routes, Flowbuilder, and storage. */

export function invoiceHeaderDiscountAmount(subtotal: number, discountType: string, discountValue: number): number {
  const s = Math.max(0, Number.isFinite(subtotal) ? subtotal : 0);
  const v = Number.isFinite(discountValue) && discountValue > 0 ? discountValue : 0;
  if (discountType === 'none') return 0;
  if (discountType === 'percentage') {
    const raw = s * (v / 100);
    return Math.min(Math.max(0, raw), s);
  }
  if (discountType === 'fixed_amount') {
    return Math.min(Math.max(0, v), s);
  }
  return 0;
}

export function invoiceLineDiscountAmount(params: {
  quantity: number;
  unitPrice: number;
  discountType: string | null | undefined;
  /** When omitted (and not `null`), percentage lines use legacy `discountPercent` even if it is 0. */
  discountValue?: number | null;
  discountPercent: number;
}): number {
  const qty = Number.isFinite(params.quantity) ? params.quantity : 0;
  const price = Number.isFinite(params.unitPrice) ? params.unitPrice : 0;
  const base = Math.max(0, qty * price);
  const dtype = String(params.discountType ?? 'percentage');
  const rawVal = params.discountValue;
  const valueSupplied = rawVal !== undefined && rawVal !== null;
  if (dtype === 'fixed_amount') {
    const v = valueSupplied && Number.isFinite(Number(rawVal)) ? Math.max(0, Number(rawVal)) : 0;
    return Math.min(v, base);
  }
  let pct: number;
  if (valueSupplied) {
    const parsed = Number(rawVal);
    pct = Number.isFinite(parsed) ? parsed : 0;
  } else {
    pct = Number.isFinite(params.discountPercent) ? params.discountPercent : 0;
  }
  const raw = base * ((Number.isFinite(pct) ? pct : 0) / 100);
  return Math.min(Math.max(0, raw), base);
}

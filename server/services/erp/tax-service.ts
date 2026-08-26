import { storage } from "../../storage";
import type { TaxRule } from "@shared/schema";

const INTERNAL_SCALE = 8;

function stripToScaled(s: string, scale: number): bigint {
  let t = String(s).trim();
  const neg = t.startsWith("-");
  if (neg) t = t.slice(1);
  const [ip, fp = ""] = t.split(".");
  const ipClean = ip.replace(/^0+(\d)/, "$1") || (fp ? "0" : "0");
  const fpPadded = (fp + "0".repeat(scale)).slice(0, scale);
  const combined = (ipClean + fpPadded).replace(/^0+(\d)/, "$1") || "0";
  let v = BigInt(combined);
  if (neg) v = -v;
  return v;
}

function scaledToString(v: bigint, scale: number): string {
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const s = abs.toString().padStart(scale + 1, "0");
  const ip = s.slice(0, -scale) || "0";
  let fp = s.slice(-scale).replace(/0+$/, "");
  let out = fp ? `${ip}.${fp}` : ip;
  if (neg) out = `-${out}`;
  return out;
}

function addDecimal(a: string, b: string): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  return scaledToString(sa + sb, INTERNAL_SCALE);
}

function mulDecimal(a: string, b: string, outFracDigits: number): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  const prod = (sa * sb) / 10n ** BigInt(INTERNAL_SCALE);
  const raw = scaledToString(prod, INTERNAL_SCALE);
  const n = Number(raw);
  return n.toFixed(outFracDigits);
}

function divDecimalToRate(amount: string, base: string, outFracDigits: number): string {
  const sa = stripToScaled(amount, INTERNAL_SCALE);
  const sb = stripToScaled(base, INTERNAL_SCALE);
  if (sb === 0n) return "0";
  const quot = (sa * 10n ** BigInt(INTERNAL_SCALE)) / sb;
  const raw = scaledToString(quot, INTERNAL_SCALE);
  const n = Number(raw);
  return n.toFixed(outFracDigits);
}

function lineSubtotal(quantity: string, unitPrice: string, discountPercent?: string): string {
  const q = Number(quantity);
  const p = Number(unitPrice);
  const d = discountPercent != null && discountPercent !== "" ? Number(discountPercent) : 0;
  if (!Number.isFinite(q) || !Number.isFinite(p)) return "0";
  const factor = Number.isFinite(d) ? 1 - d / 100 : 1;
  return (q * p * (factor > 0 ? factor : 0)).toFixed(4);
}

function isRuleInEffect(rule: TaxRule, asOf: Date): boolean {
  if (rule.effectiveFrom && asOf < new Date(rule.effectiveFrom)) return false;
  if (rule.effectiveTo && asOf > new Date(rule.effectiveTo)) return false;
  return true;
}

function appliesToMatches(rule: TaxRule, productType?: string): boolean {
  if (!productType) return true;
  const pt = productType === "service" ? "services" : productType === "product" ? "products" : productType;
  if (rule.appliesTo === "both") return true;
  return rule.appliesTo === pt;
}

export async function calculateTax(
  companyId: number,
  lineAmount: string,
  taxGroupId: number | null,
  taxRate?: string
): Promise<{
  taxAmount: string;
  effectiveRate: string;
  breakdown: Array<{ ruleName: string; rate: string; amount: string }>;
}> {
  const breakdown: Array<{ ruleName: string; rate: string; amount: string }> = [];
   if (taxGroupId != null) {
    const links = await storage.getTaxGroupRules(taxGroupId);
    const sorted = [...links].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    let priorTaxTotal = "0";
    let totalTax = "0";
    for (const link of sorted) {
      const rule = await storage.getTaxRule(link.taxRuleId);
      if (!rule || rule.companyId !== companyId || !rule.isActive) continue;
      if (rule.type === "exempt" || Number(rule.rate) === 0) {
        breakdown.push({ ruleName: rule.name, rate: String(rule.rate), amount: "0.00" });
        continue;
      }
      const rateFrac = mulDecimal(String(rule.rate), "0.01", 8);
      const base = rule.isCompound ? addDecimal(lineAmount, priorTaxTotal) : lineAmount;
      const part = mulDecimal(base, rateFrac, 4);
      breakdown.push({ ruleName: rule.name, rate: String(rule.rate), amount: part });
      totalTax = addDecimal(totalTax, part);
      priorTaxTotal = addDecimal(priorTaxTotal, part);
    }
    const eff = Number(lineAmount) === 0 ? "0.00" : divDecimalToRate(totalTax, lineAmount, 4);
    return { taxAmount: Number(totalTax).toFixed(2), effectiveRate: eff, breakdown };
  }
  if (taxRate != null && taxRate !== "") {
    const rateFrac = mulDecimal(String(taxRate), "0.01", 8);
    const taxAmount = mulDecimal(lineAmount, rateFrac, 4);
    return {
      taxAmount: Number(taxAmount).toFixed(2),
      effectiveRate: Number(taxRate).toFixed(2),
      breakdown: [{ ruleName: "Flat rate", rate: String(taxRate), amount: Number(taxAmount).toFixed(2) }],
    };
  }
  return { taxAmount: "0.00", effectiveRate: "0.00", breakdown: [] };
}

export async function getApplicableTaxRules(
  companyId: number,
  options: { productType?: string; country?: string; region?: string }
): Promise<TaxRule[]> {
  const all = await storage.getTaxRules(companyId, { isActive: true });
  const asOf = new Date();
  return all.filter((rule) => {
    if (!isRuleInEffect(rule, asOf)) return false;
    if (!appliesToMatches(rule, options.productType)) return false;
    if (options.country && rule.country && rule.country !== options.country) return false;
    if (options.region && rule.region && rule.region !== options.region) return false;
    return true;
  });
}

export async function calculateLineTotals(
  companyId: number,
  items: Array<{
    quantity: string;
    unitPrice: string;
    discountPercent?: string;
    taxGroupId?: number;
    taxRate?: string;
  }>
): Promise<{
  subtotal: string;
  taxAmount: string;
  totalAmount: string;
  itemTotals: Array<{ lineTotal: string; taxAmount: string }>;
}> {
  let subtotal = "0.00";
  let taxAmount = "0.00";
  const itemTotals: Array<{ lineTotal: string; taxAmount: string }> = [];
  for (const it of items) {
    const lineTotal = lineSubtotal(it.quantity, it.unitPrice, it.discountPercent);
    const tax = await calculateTax(companyId, lineTotal, it.taxGroupId ?? null, it.taxRate);
    subtotal = (Number(subtotal) + Number(lineTotal)).toFixed(2);
    taxAmount = (Number(taxAmount) + Number(tax.taxAmount)).toFixed(2);
    itemTotals.push({ lineTotal: Number(lineTotal).toFixed(2), taxAmount: tax.taxAmount });
  }
  const totalAmount = (Number(subtotal) + Number(taxAmount)).toFixed(2);
  return { subtotal, taxAmount, totalAmount, itemTotals };
}

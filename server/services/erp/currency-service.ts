import { ErpValidationError, storage } from "../../storage";

const INTERNAL_SCALE = 8;

function normalizeDecimalString(s: string, maxFrac: number): string {
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("Invalid numeric string");
  return n.toFixed(maxFrac);
}

function stripToScaled(s: string, scale: number): bigint {
  let t = s.trim();
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

function mulDecimal(a: string, b: string, outFracDigits: number): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  const prod = (sa * sb) / 10n ** BigInt(INTERNAL_SCALE);
  const s = scaledToString(prod, INTERNAL_SCALE);
  return normalizeDecimalString(s, outFracDigits);
}

function divDecimal(a: string, b: string, outFracDigits: number): string {
  const sa = stripToScaled(a, INTERNAL_SCALE);
  const sb = stripToScaled(b, INTERNAL_SCALE);
  if (sb === 0n) throw new Error("Division by zero");
  const quot = (sa * 10n ** BigInt(INTERNAL_SCALE)) / sb;
  const s = scaledToString(quot, INTERNAL_SCALE);
  return normalizeDecimalString(s, outFracDigits);
}

export async function convertAmount(
  amount: string,
  fromCurrency: string,
  toCurrency: string,
  companyId: number
): Promise<string> {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return normalizeDecimalString(amount, 6);

  const direct = await storage.getLatestExchangeRate(companyId, from, to);
  if (direct) {
    const directRate = Number(direct.rate);
    if (!Number.isFinite(directRate) || directRate <= 0) {
      throw new ErpValidationError(`Invalid exchange rate for ${from} -> ${to}`);
    }
    return mulDecimal(amount, String(direct.rate), 6);
  }
  const inverse = await storage.getLatestExchangeRate(companyId, to, from);
  if (inverse) {
    const invRate = String(inverse.rate);
    if (!Number.isFinite(Number(invRate)) || Number(invRate) <= 0) {
      throw new ErpValidationError(`Invalid inverse rate for ${from} -> ${to}`);
    }
    return mulDecimal(amount, divDecimal("1", invRate, 8), 6);
  }
  throw new ErpValidationError(`No exchange rate found for ${from} -> ${to}`);
}

export async function getEffectiveRate(
  companyId: number,
  fromCurrency: string,
  toCurrency: string,
  asOfDate?: Date
): Promise<number> {
  const from = fromCurrency.trim().toUpperCase();
  const to = toCurrency.trim().toUpperCase();
  if (from === to) return 1;
  const direct = await storage.getLatestExchangeRate(companyId, from, to, asOfDate);
  if (direct) {
    const directRate = Number(direct.rate);
    if (!Number.isFinite(directRate) || directRate <= 0) {
      throw new ErpValidationError(`Invalid exchange rate for ${from} -> ${to}`);
    }
    return directRate;
  }
  const inverse = await storage.getLatestExchangeRate(companyId, to, from, asOfDate);
  if (inverse) {
    const inverseRate = Number(inverse.rate);
    if (!Number.isFinite(inverseRate) || inverseRate <= 0) {
      throw new ErpValidationError(`Invalid inverse rate for ${from} -> ${to}`);
    }
    return 1 / inverseRate;
  }
  throw new ErpValidationError(`No exchange rate found for ${from} -> ${to}`);
}

export async function formatCurrency(amount: string, currencyCode: string, companyId: number): Promise<string> {
  const code = currencyCode.trim().toUpperCase();
  const row = await storage.getCurrencyByCode(companyId, code);
  const dp = row?.decimalPlaces ?? 2;
  const sym = row?.symbol ?? code;
  const n = Number(amount);
  if (!Number.isFinite(n)) throw new Error("Invalid amount");
  const formatted = n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return `${sym}${formatted}`;
}

/**
 * Billing currency resolution for company-level purchases (add-ons today; anything else that is
 * priced per-country in the future should reuse this).
 *
 * Explicit business rule (not an oversight): a company headquartered in the European Union is
 * billed in EUR. Every other company — including one with an unknown, missing, or malformed
 * country code — is billed in USD ("lo demás en USD"). This must be derived ONLY from the
 * company's persisted `country` column, never from request-time signals like IP geolocation or
 * browser locale, so the currency (and therefore the amount charged) can't be changed by anything
 * the client controls.
 */

export type BillingCurrency = 'EUR' | 'USD';

/** ISO 3166-1 alpha-2 codes of the 27 European Union member states. */
export const EU_COUNTRIES: ReadonlySet<string> = new Set([
  'AT', // Austria
  'BE', // Belgium
  'BG', // Bulgaria
  'HR', // Croatia
  'CY', // Cyprus
  'CZ', // Czechia
  'DK', // Denmark
  'EE', // Estonia
  'FI', // Finland
  'FR', // France
  'DE', // Germany
  'GR', // Greece
  'HU', // Hungary
  'IE', // Ireland
  'IT', // Italy
  'LV', // Latvia
  'LT', // Lithuania
  'LU', // Luxembourg
  'MT', // Malta
  'NL', // Netherlands
  'PL', // Poland
  'PT', // Portugal
  'RO', // Romania
  'SK', // Slovakia
  'SI', // Slovenia
  'ES', // Spain
  'SE', // Sweden
]);

/**
 * Resolves the currency a company should be billed in.
 *
 * - A recognized EU member state code (case-insensitive, whitespace-tolerant) -> 'EUR'.
 * - Anything else — non-EU country, null, undefined, empty string, or an unrecognized/malformed
 *   code — -> 'USD'.
 */
export function resolveBillingCurrency(countryCode?: string | null): BillingCurrency {
  if (!countryCode) {
    return 'USD';
  }
  const normalized = countryCode.trim().toUpperCase();
  return EU_COUNTRIES.has(normalized) ? 'EUR' : 'USD';
}

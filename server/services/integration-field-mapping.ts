const PROTECTED_ZINTO_FIELDS = new Set([
  'id',
  'companyId',
  'createdAt',
  'updatedAt',
  'deletedAt',
]);

/**
 * Applies a per-integration inbound field map without allowing the external
 * CRM to supply tenant ownership or audit fields.
 */
export function applyInboundFieldMapping(
  source: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [zintoField, sourceField] of Object.entries(mapping)) {
    if (PROTECTED_ZINTO_FIELDS.has(zintoField)) {
      throw new Error(`Integration cannot map protected field: ${zintoField}`);
    }

    const value = source[sourceField];
    if (value !== undefined) {
      result[zintoField] = value;
    }
  }

  return result;
}

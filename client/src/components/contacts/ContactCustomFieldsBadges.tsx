import { Badge } from '@/components/ui/badge';

/** Helper to convert fieldName to label (e.g. "lead_source" -> "Lead Source") */
function fieldNameToLabel(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

type SchemaField = {
  fieldName: string;
  fieldLabel: string;
  fieldType?: string;
  options?: { value: string; label: string }[] | { trueLabel?: string; falseLabel?: string } | null;
};

export function ContactCustomFieldsBadges({
  customFields,
  schema,
  maxVisible = 5,
  className = '',
}: {
  customFields?: Record<string, any> | null;
  schema?: SchemaField[];
  maxVisible?: number;
  className?: string;
}) {
  if (!customFields || typeof customFields !== 'object' || Object.keys(customFields).length === 0) {
    return null;
  }

  const items: { label: string; value: string }[] = [];

  for (const [key, val] of Object.entries(customFields)) {
    if (val === undefined || val === null || val === '') continue;
    if (Array.isArray(val) && val.length === 0) continue;

    const schemaField = schema?.find((f) => f.fieldName === key);
    const fieldLabel = schemaField?.fieldLabel || fieldNameToLabel(key);
    const boolOpts = schemaField?.fieldType === 'boolean' && schemaField?.options && !Array.isArray(schemaField.options)
      ? (schemaField.options as { trueLabel?: string; falseLabel?: string })
      : null;
    const displayVal = Array.isArray(val)
      ? val.map((v) => String(v)).join(', ')
      : typeof val === 'boolean'
      ? val
        ? (boolOpts?.trueLabel ?? 'Yes')
        : (boolOpts?.falseLabel ?? 'No')
      : String(val);
    if (Array.isArray(val)) {
      val.forEach((v) => items.push({ label: fieldLabel, value: String(v) }));
    } else {
      items.push({ label: fieldLabel, value: displayVal });
    }
  }

  if (items.length === 0) return null;

  const visible = items.slice(0, maxVisible);
  const remaining = items.length - maxVisible;

  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {visible.map((item, idx) => (
        <Badge
          key={`${item.label}-${item.value}-${idx}`}
          variant="secondary"
          className="text-xs px-1.5 py-0.5 !bg-muted !text-muted-foreground shrink-0"
          title={item.label ? `${item.label}: ${item.value}` : item.value}
        >
          {item.label ? `${item.label}: ${item.value}` : item.value}
        </Badge>
      ))}
      {remaining > 0 && (
        <Badge variant="outline" className="text-xs px-1.5 py-0.5 shrink-0">
          +{remaining}
        </Badge>
      )}
    </div>
  );
}

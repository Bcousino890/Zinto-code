import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFeatureComparisonRows, sortPlansByPriceDescending } from './planComparison';

test('sorts plans from highest price to lowest without mutating the input', () => {
  const original = [{ price: 10 }, { price: 30 }, { price: 20 }];
  const sorted = sortPlansByPriceDescending(original);

  assert.deepEqual(sorted, [{ price: 30 }, { price: 20 }, { price: 10 }]);
  assert.deepEqual(original, [{ price: 10 }, { price: 30 }, { price: 20 }]);
});

test('sorts by numeric value even when price is stored as a string', () => {
  const sorted = sortPlansByPriceDescending([{ price: '9.99' }, { price: '29.99' }, { price: '19.99' }]);

  assert.deepEqual(sorted, [{ price: '29.99' }, { price: '19.99' }, { price: '9.99' }]);
});

test('deduplicates an identical feature shared by multiple plans into one row', () => {
  const rows = buildFeatureComparisonRows([
    { id: 1, features: ['CRM, contactos y pipeline de ventas', 'Bandeja omnicanal'] },
    { id: 2, features: ['CRM, contactos y pipeline de ventas'] },
  ]);

  assert.deepEqual(rows, [
    { label: 'CRM, contactos y pipeline de ventas', includedByPlanId: { 1: true, 2: true } },
    { label: 'Bandeja omnicanal', includedByPlanId: { 1: true } },
  ]);
});

test('preserves first-seen order across plans and leaves plans without the feature unmarked', () => {
  const rows = buildFeatureComparisonRows([
    { id: 1, features: ['A', 'B'] },
    { id: 2, features: ['C', 'A'] },
  ]);

  assert.deepEqual(rows.map((row) => row.label), ['A', 'B', 'C']);
  assert.equal(rows.find((row) => row.label === 'B')?.includedByPlanId[2], undefined);
  assert.equal(rows.find((row) => row.label === 'C')?.includedByPlanId[1], undefined);
});

test('skips blank entries and tolerates plans with no feature list', () => {
  const rows = buildFeatureComparisonRows([
    { id: 1, features: ['', '   ', 'Real feature'] },
    { id: 2, features: null },
    { id: 3 },
  ]);

  assert.deepEqual(rows, [{ label: 'Real feature', includedByPlanId: { 1: true } }]);
});

test('reads campaignFeatures instead of features when listKey is "campaignFeatures"', () => {
  const rows = buildFeatureComparisonRows(
    [
      { id: 1, features: ['ignored'], campaignFeatures: ['basic_campaigns'] },
      { id: 2, features: ['ignored'], campaignFeatures: ['basic_campaigns', 'email_and_whatsapp_campaigns'] },
    ],
    'campaignFeatures'
  );

  assert.deepEqual(rows, [
    { label: 'basic_campaigns', includedByPlanId: { 1: true, 2: true } },
    { label: 'email_and_whatsapp_campaigns', includedByPlanId: { 2: true } },
  ]);
});

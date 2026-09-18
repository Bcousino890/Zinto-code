import assert from 'node:assert/strict';
import test from 'node:test';

import { EU_COUNTRIES, resolveBillingCurrency } from '../shared/billing-currency';

test('resuelve EUR para los 27 estados miembro de la Unión Europea', () => {
  assert.equal(EU_COUNTRIES.size, 27);
  for (const code of EU_COUNTRIES) {
    assert.equal(resolveBillingCurrency(code), 'EUR', `esperaba EUR para ${code}`);
  }
});

test('resuelve EUR ignorando mayúsculas/minúsculas y espacios', () => {
  assert.equal(resolveBillingCurrency('es'), 'EUR');
  assert.equal(resolveBillingCurrency(' Es '), 'EUR');
  assert.equal(resolveBillingCurrency('De'), 'EUR');
});

test('resuelve USD para países fuera de la Unión Europea', () => {
  assert.equal(resolveBillingCurrency('US'), 'USD');
  assert.equal(resolveBillingCurrency('MX'), 'USD');
  assert.equal(resolveBillingCurrency('GB'), 'USD'); // post-Brexit: not in EU_COUNTRIES
  assert.equal(resolveBillingCurrency('CO'), 'USD');
  assert.equal(resolveBillingCurrency('AR'), 'USD');
});

test('resuelve USD por defecto cuando el país es null, undefined, vacío o desconocido', () => {
  assert.equal(resolveBillingCurrency(null), 'USD');
  assert.equal(resolveBillingCurrency(undefined), 'USD');
  assert.equal(resolveBillingCurrency(''), 'USD');
  assert.equal(resolveBillingCurrency('   '), 'USD');
  assert.equal(resolveBillingCurrency('XX'), 'USD');
  assert.equal(resolveBillingCurrency('ZZZZ'), 'USD');
});

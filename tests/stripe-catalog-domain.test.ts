import assert from 'node:assert/strict';
import test from 'node:test';

import {
  catalogFingerprint,
  chooseBestDiscount,
  mapBillingInterval,
  toMinorUnits,
  type CouponLike,
  type PlanLike,
} from '../server/services/stripe-catalog-domain';

test('convierte EUR a céntimos sin errores flotantes', () => {
  assert.equal(toMinorUnits('29.25', 'EUR'), 2925);
});

test('mantiene importes enteros para monedas sin decimales', () => {
  assert.equal(toMinorUnits(2925, 'jpy'), 2925);
});

test('rechaza importes monetarios con formato inválido', () => {
  for (const amount of ['', '-1', '1,50', 'NaN', Number.POSITIVE_INFINITY]) {
    assert.throws(() => toMinorUnits(amount, 'EUR'), /Invalid monetary amount/);
  }
});

test('mapea trimestral a tres meses', () => {
  assert.deepEqual(mapBillingInterval('quarterly'), { interval: 'month', interval_count: 3 });
});

test('mapea todos los intervalos actuales de planes', () => {
  const cases = [
    ['lifetime', null],
    ['daily', { interval: 'day', interval_count: 1 }],
    ['weekly', { interval: 'week', interval_count: 1 }],
    ['biweekly', { interval: 'week', interval_count: 2 }],
    ['monthly', { interval: 'month', interval_count: 1 }],
    ['quarterly', { interval: 'month', interval_count: 3 }],
    ['semi_annual', { interval: 'month', interval_count: 6 }],
    ['annual', { interval: 'year', interval_count: 1 }],
    ['biennial', { interval: 'year', interval_count: 2 }],
  ] as const;

  for (const [interval, expected] of cases) {
    assert.deepEqual(mapBillingInterval(interval), expected);
  }
});

test('usa la unidad exacta mayor para duraciones personalizadas', () => {
  assert.deepEqual(mapBillingInterval('custom', 730), { interval: 'year', interval_count: 2 });
  assert.deepEqual(mapBillingInterval('custom', 60), { interval: 'month', interval_count: 2 });
  assert.deepEqual(mapBillingInterval('custom', 14), { interval: 'week', interval_count: 2 });
  assert.deepEqual(mapBillingInterval('custom', 31), { interval: 'day', interval_count: 31 });
});

test('rechaza intervalos desconocidos y duraciones que Stripe no puede expresar', () => {
  assert.throws(() => mapBillingInterval('hourly'), /Unsupported billing interval/);
  assert.throws(() => mapBillingInterval('custom'), /Invalid custom billing interval/);
  assert.throws(() => mapBillingInterval('custom', 0), /Invalid custom billing interval/);
  assert.throws(() => mapBillingInterval('custom', 1.5), /Invalid custom billing interval/);
  assert.throws(() => mapBillingInterval('custom', 1096), /Invalid custom billing interval/);
});

const planWith25Percent: PlanLike = {
  id: 7,
  price: '75.00',
  originalPrice: '100.00',
  discountType: 'percentage',
  discountValue: '25',
};

const couponWith10Percent: CouponLike = {
  discountType: 'percentage',
  discountValue: '10',
  isActive: true,
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  endDate: new Date('2026-12-31T23:59:59.999Z'),
};

test('elige el descuento con menor total sin acumularlos', () => {
  assert.equal(
    chooseBestDiscount(
      planWith25Percent,
      couponWith10Percent,
      new Date('2026-09-13T00:00:00.000Z'),
    ).source,
    'plan',
  );
});

test('elige un cupón cuando produce un total menor', () => {
  const decision = chooseBestDiscount(
    planWith25Percent,
    { ...couponWith10Percent, discountType: 'fixed_amount', discountValue: '30' },
    new Date('2026-09-13T00:00:00.000Z'),
  );

  assert.deepEqual(decision, {
    source: 'coupon',
    originalAmount: 100,
    discountAmount: 30,
    finalAmount: 70,
  });
});

test('redondea descuentos porcentuales a céntimos con aritmética decimal', () => {
  assert.deepEqual(
    chooseBestDiscount({
      price: '30.22',
      originalPrice: '40.30',
      discountType: 'percentage',
      discountValue: '25',
    }),
    {
      source: 'plan',
      originalAmount: 40.3,
      discountAmount: 10.08,
      finalAmount: 30.22,
    },
  );
});

test('ignora descuentos inactivos, futuros o vencidos', () => {
  const now = new Date('2026-09-13T00:00:00.000Z');
  const planWithoutActiveDiscount: PlanLike = {
    ...planWith25Percent,
    discountEndDate: new Date('2026-09-12T23:59:59.999Z'),
  };

  assert.deepEqual(
    chooseBestDiscount(planWithoutActiveDiscount, { ...couponWith10Percent, isActive: false }, now),
    {
      source: 'none',
      originalAmount: 75,
      discountAmount: 0,
      finalAmount: 75,
    },
  );
  assert.equal(
    chooseBestDiscount(planWithoutActiveDiscount, {
      ...couponWith10Percent,
      startDate: new Date('2026-09-14T00:00:00.000Z'),
    }, now).source,
    'none',
  );
});

test('ignora cupones con el límite global agotado', () => {
  assert.equal(
    chooseBestDiscount(planWith25Percent, {
      discountType: 'fixed_amount',
      discountValue: '90',
      usageLimit: 5,
      currentUsageCount: 5,
    }).source,
    'plan',
  );
});

test('ignora cupones restringidos a otros planes', () => {
  assert.equal(
    chooseBestDiscount(planWith25Percent, {
      discountType: 'fixed_amount',
      discountValue: '90',
      applicablePlanIds: [8, 9],
    }).source,
    'plan',
  );
});

test('ignora cupones cuando el plan no alcanza el importe mínimo', () => {
  assert.equal(
    chooseBestDiscount(planWith25Percent, {
      discountType: 'fixed_amount',
      discountValue: '90',
      minimumPlanValue: '100.01',
    }).source,
    'plan',
  );
});

test('trata la actividad nula del cupón como no desactivada', () => {
  assert.equal(
    chooseBestDiscount(planWith25Percent, {
      discountType: 'fixed_amount',
      discountValue: '30',
      isActive: null,
    }).source,
    'coupon',
  );
});

test('conserva el descuento del plan cuando ambos producen el mismo total', () => {
  assert.equal(
    chooseBestDiscount(planWith25Percent, {
      discountType: 'percentage',
      discountValue: '25',
    }).source,
    'plan',
  );
});

test('limita descuentos fijos y porcentuales al importe original', () => {
  const fixed = chooseBestDiscount(
    { price: '20', discountType: 'none' },
    { discountType: 'fixed_amount', discountValue: '25', isActive: true },
  );
  const percentage = chooseBestDiscount({
    price: '20',
    originalPrice: '20',
    discountType: 'percentage',
    discountValue: '150',
  });

  assert.equal(fixed.finalAmount, 0);
  assert.equal(percentage.finalAmount, 0);
});

test('produce la misma huella para objetos equivalentes sin depender del orden de claves', () => {
  const first = catalogFingerprint({ plan: { id: 7, price: '29.25' }, active: true });
  const second = catalogFingerprint({ active: true, plan: { price: '29.25', id: 7 } });

  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
});

test('conserva el orden de arrays al calcular la huella', () => {
  assert.notEqual(catalogFingerprint(['monthly', 'annual']), catalogFingerprint(['annual', 'monthly']));
});

test('distingue fechas de objetos ordinarios con la misma forma', () => {
  const isoDate = '2026-09-13T00:00:00.000Z';

  assert.notEqual(catalogFingerprint(new Date(isoDate)), catalogFingerprint({ $date: isoDate }));
});

test('rechaza valores fuera del dominio de catálogo', () => {
  for (const value of [1n, new Map([['price', '29.25']]), new Set(['monthly'])]) {
    assert.throws(() => catalogFingerprint(value), /Unsupported catalog fingerprint value/);
  }
});

test('rechaza arrays dispersos para evitar huellas ambiguas', () => {
  assert.match(catalogFingerprint([]), /^[a-f0-9]{64}$/);
  assert.throws(() => catalogFingerprint(Array(1)), /Sparse arrays are not supported/);
});

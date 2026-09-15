import assert from 'node:assert/strict';
import test from 'node:test';

import { planExpirationService } from '../server/services/plan-expiration-service';
import type { Company, Plan } from '../shared/schema';

function fakeCompany(overrides: Partial<Company>): Company {
  return {
    id: 1,
    name: 'Acme Propiedades',
    slug: 'acme-propiedades',
    planId: 1,
    subscriptionStatus: 'active',
    subscriptionEndDate: null,
    gracePeriodEnd: null,
    trialEndDate: null,
    isInTrial: false,
    ...overrides,
  } as unknown as Company;
}

function fakePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 1,
    name: 'Pro',
    isFree: false,
    hasTrialPeriod: false,
    gracePeriodDays: 15,
    ...overrides,
  } as unknown as Plan;
}

test('a subscription 71 days past its end date, still flagged active in the DB, cannot access the app', async () => {
  // Regression test for the exact production case: subscriptionStatus never
  // flips away from 'active' on its own, so a naive check that trusts that
  // string (instead of the real end date) waves an expired account through
  // forever. Grace period already elapsed (71 days > any plan's grace days).
  const company = fakeCompany({
    subscriptionStatus: 'active',
    subscriptionEndDate: new Date(Date.now() - 71 * 24 * 60 * 60 * 1000),
    gracePeriodEnd: new Date(Date.now() - 56 * 24 * 60 * 60 * 1000),
  });

  const status = await planExpirationService.getExpirationStatus(company, fakePlan());

  assert.equal(status.isExpired, true);
  assert.equal(status.isInGracePeriod, false);
  assert.equal(status.canAccess, false);
  assert.equal(status.renewalRequired, true);
});

test('a subscription still within its end date keeps access, regardless of status label', async () => {
  const company = fakeCompany({
    subscriptionStatus: 'active',
    subscriptionEndDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
  });

  const status = await planExpirationService.getExpirationStatus(company, fakePlan());

  assert.equal(status.isExpired, false);
  assert.equal(status.canAccess, true);
});

test('a subscription within its grace period keeps access', async () => {
  const company = fakeCompany({
    subscriptionStatus: 'grace_period',
    subscriptionEndDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    gracePeriodEnd: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
  });

  const status = await planExpirationService.getExpirationStatus(company, fakePlan());

  assert.equal(status.isExpired, true);
  assert.equal(status.isInGracePeriod, true);
  assert.equal(status.canAccess, true);
});

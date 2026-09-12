import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyApiDocumentation } from '../../scripts/verify-api-docs';

test('API documentation stays aligned with the v2 router contract', () => {
  const result = verifyApiDocumentation();

  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.equal(result.routesChecked > 0, true);
});

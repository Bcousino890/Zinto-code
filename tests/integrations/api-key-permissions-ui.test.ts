import assert from 'node:assert/strict';
import test from 'node:test';

import { toggleApiKeyScope } from '../../client/src/components/settings/api-key-permissions';

test('adds a requested permission without changing existing permissions', () => {
  assert.deepEqual(
    toggleApiKeyScope(['contacts:read'], 'messages:send'),
    ['contacts:read', 'messages:send'],
  );
});

test('removes a permission when the administrator unticks it', () => {
  assert.deepEqual(
    toggleApiKeyScope(['contacts:read', 'messages:send'], 'contacts:read'),
    ['messages:send'],
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  launchInstagramSignup,
  launchMessengerSignup,
  type FacebookLoginResponse,
} from '../client/src/lib/facebook-sdk';

test('Meta channel signup requests a direct access token from the Facebook SDK', async () => {
  const loginOptions: Array<Record<string, unknown> | undefined> = [];

  (globalThis as any).window = {
    location: { protocol: 'https:' },
    FB: {
      getLoginStatus(callback: (response: unknown) => void) {
        callback({ status: 'connected' });
      },
      login(
        callback: (response: FacebookLoginResponse) => void,
        options?: Record<string, unknown>
      ) {
        loginOptions.push(options);
        callback({
          status: 'connected',
          authResponse: {
            accessToken: 'short-lived-user-token',
            userID: '123',
            expiresIn: 3600,
            signedRequest: 'signed-request',
          },
        });
      },
    },
  };

  await launchInstagramSignup('instagram-config', () => undefined);
  await launchMessengerSignup('messenger-config', () => undefined);

  assert.deepEqual(loginOptions, [
    {
      config_id: 'instagram-config',
      extras: { setup: {}, sessionInfoVersion: '3' },
    },
    {
      config_id: 'messenger-config',
      extras: { setup: {}, sessionInfoVersion: '3' },
    },
  ]);
});

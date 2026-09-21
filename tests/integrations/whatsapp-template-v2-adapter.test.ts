import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createWhatsAppTemplatesReadAdapter,
  createWhatsAppTemplatesWriteAdapter,
} from '../../server/services/whatsapp-template-v2-adapter';
import { WhatsAppTemplateValidationError } from '../../server/services/whatsapp-template-v2-service';
import type { WhatsAppTemplateOperationResult } from '../../server/services/whatsapp-template-management-service';

test('read adapter list() returns the rows unchanged on success', async () => {
  const adapter = createWhatsAppTemplatesReadAdapter({
    listCompanyTemplates: async (companyId) => {
      assert.equal(companyId, 12);
      return { status: 200, body: [{ id: 1, name: 'welcome' }] as any };
    },
    getCompanyTemplate: async () => ({ status: 404, body: {} }),
  });

  const result = await adapter.list(12);
  assert.deepEqual(result, [{ id: 1, name: 'welcome' }]);
});

test('read adapter list() throws (never leaks the raw body) on an unexpected status', async () => {
  const adapter = createWhatsAppTemplatesReadAdapter({
    listCompanyTemplates: async () => ({ status: 500, body: { error: 'Failed to fetch templates' } }),
    getCompanyTemplate: async () => ({ status: 404, body: {} }),
  });

  await assert.rejects(() => adapter.list(12), /Template list failed \(status 500\)/);
});

test('read adapter get() maps 404 to null and passes through a found template', async () => {
  const adapter = createWhatsAppTemplatesReadAdapter({
    listCompanyTemplates: async () => ({ status: 200, body: [] as any }),
    getCompanyTemplate: async (companyId, templateId) => {
      if (templateId === 99) return { status: 404, body: { error: 'Template not found' } };
      assert.equal(companyId, 12);
      return { status: 200, body: { id: templateId, name: 'welcome' } };
    },
  });

  assert.equal(await adapter.get(12, 99), null);
  assert.deepEqual(await adapter.get(12, 5), { id: 5, name: 'welcome' });
});

test('write adapter create() returns the created template on 201', async () => {
  const adapter = createWhatsAppTemplatesWriteAdapter({
    createCompanyTemplate: async (companyId, userId, input) => {
      assert.equal(companyId, 12);
      assert.equal(userId, 3);
      assert.equal((input as any).name, 'welcome');
      return { status: 201, body: { id: 1, name: 'welcome' } };
    },
    updateCompanyTemplate: async () => ({ status: 404, body: {} }),
    deleteCompanyTemplate: async () => ({ status: 404, body: {} }),
  });

  const result = await adapter.create(12, 3, { name: 'welcome', content: 'Hi', connectionId: 7 });
  assert.deepEqual(result, { id: 1, name: 'welcome' });
});

const knownSafeCases: Array<{ status: number; error: string }> = [
  { status: 400, error: 'Name and content are required' },
  { status: 400, error: 'Template name must contain only lowercase letters, numbers, and underscores' },
  { status: 400, error: 'WhatsApp connection is required' },
  { status: 400, error: 'A template with this name already exists' },
  { status: 400, error: 'Selected connection is not a WhatsApp Official channel' },
  { status: 400, error: 'WhatsApp Business Account ID or access token not found in connection' },
  { status: 400, error: 'App ID not found in connection. Media upload requires App ID for Resumable Upload API.' },
  { status: 400, error: 'A template with this name is currently being deleted. Please wait 1-2 minutes before creating a new template with the same name, or use a different name.' },
  { status: 400, error: 'A template with this name and language already exists. Please use a different name or delete the existing template first.' },
  { status: 400, error: 'Failed to upload media. Please try again or use a different image.' },
];

for (const { error } of knownSafeCases) {
  test(`write adapter create() reuses the known-safe message verbatim: "${error}"`, async () => {
    const adapter = createWhatsAppTemplatesWriteAdapter({
      createCompanyTemplate: async (): Promise<WhatsAppTemplateOperationResult> => ({ status: 400, body: { error } }),
      updateCompanyTemplate: async () => ({ status: 404, body: {} }),
      deleteCompanyTemplate: async () => ({ status: 404, body: {} }),
    });

    await assert.rejects(
      () => adapter.create(12, 3, { name: 'x', content: 'x', connectionId: 1 }),
      (thrown: unknown) => {
        assert.ok(thrown instanceof WhatsAppTemplateValidationError);
        assert.equal((thrown as Error).message, error);
        return true;
      },
    );
  });
}

test('write adapter create() strips the raw exception text from a media-upload failure instead of forwarding it', async () => {
  const adapter = createWhatsAppTemplatesWriteAdapter({
    createCompanyTemplate: async (): Promise<WhatsAppTemplateOperationResult> => ({
      status: 400,
      body: { error: 'Failed to upload media to WhatsApp: connect ETIMEDOUT 10.0.0.5:443 (internal load balancer)' },
    }),
    updateCompanyTemplate: async () => ({ status: 404, body: {} }),
    deleteCompanyTemplate: async () => ({ status: 404, body: {} }),
  });

  await assert.rejects(
    () => adapter.create(12, 3, { name: 'x', content: 'x', connectionId: 1 }),
    (thrown: unknown) => {
      assert.ok(thrown instanceof WhatsAppTemplateValidationError);
      const message = (thrown as Error).message;
      assert.equal(message, 'Failed to upload media to WhatsApp');
      assert.ok(!message.includes('10.0.0.5'), 'must not leak the internal IP from the caught exception');
      assert.ok(!message.includes('ETIMEDOUT'), 'must not leak raw exception text');
      return true;
    },
  );
});

test('write adapter create() never confirms/denies a foreign connectionId (404/403 become a generic error)', async () => {
  for (const status of [403, 404] as const) {
    const adapter = createWhatsAppTemplatesWriteAdapter({
      createCompanyTemplate: async (): Promise<WhatsAppTemplateOperationResult> => ({
        status,
        body: { error: status === 404 ? 'WhatsApp connection not found' : 'Unauthorized access to this connection' },
      }),
      updateCompanyTemplate: async () => ({ status: 404, body: {} }),
      deleteCompanyTemplate: async () => ({ status: 404, body: {} }),
    });

    await assert.rejects(
      () => adapter.create(12, 3, { name: 'x', content: 'x', connectionId: 999 }),
      (thrown: unknown) => {
        assert.ok(!(thrown instanceof WhatsAppTemplateValidationError), 'must not be treated as a safe validation error');
        assert.ok(!(thrown as Error).message.includes('connection'), 'must not describe why the connectionId was rejected');
        return true;
      },
    );
  }
});

test('write adapter create() falls back to a generic error for an unrecognized 400 message (never assumes new messages are safe)', async () => {
  const adapter = createWhatsAppTemplatesWriteAdapter({
    createCompanyTemplate: async (): Promise<WhatsAppTemplateOperationResult> => ({
      status: 400,
      body: { error: 'Some brand-new internal message nobody allow-listed yet' },
    }),
    updateCompanyTemplate: async () => ({ status: 404, body: {} }),
    deleteCompanyTemplate: async () => ({ status: 404, body: {} }),
  });

  await assert.rejects(
    () => adapter.create(12, 3, { name: 'x', content: 'x', connectionId: 1 }),
    (thrown: unknown) => {
      assert.ok(!(thrown instanceof WhatsAppTemplateValidationError));
      return true;
    },
  );
});

test('write adapter update()/delete() map 404 to null/false and pass through success', async () => {
  const adapter = createWhatsAppTemplatesWriteAdapter({
    createCompanyTemplate: async () => ({ status: 201, body: {} }),
    updateCompanyTemplate: async (companyId, templateId) =>
      templateId === 99 ? { status: 404, body: { error: 'Template not found' } } : { status: 200, body: { id: templateId, isActive: false } },
    deleteCompanyTemplate: async (companyId, templateId) =>
      templateId === 99 ? { status: 404, body: { error: 'Template not found' } } : { status: 200, body: { success: true } },
  });

  assert.equal(await adapter.update(12, 99, { isActive: false }), null);
  assert.deepEqual(await adapter.update(12, 5, { isActive: false }), { id: 5, isActive: false });
  assert.equal(await adapter.delete(12, 99), false);
  assert.equal(await adapter.delete(12, 5), true);
});

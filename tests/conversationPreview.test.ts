import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldMarkConversationRead, conversationSelectionMode } from '../client/src/utils/conversationPreview';

test('preview conversations do not mark messages as read', () => {
  assert.equal(shouldMarkConversationRead(true), false);
});

test('normal conversations continue marking messages as read', () => {
  assert.equal(shouldMarkConversationRead(false), true);
});

test('selecting preview keeps the conversation in preview mode', () => {
  assert.equal(conversationSelectionMode(true), 'preview');
  assert.equal(conversationSelectionMode(false), 'normal');
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

type Translation = { key: string; value: string };

function translationsFor(language: 'en' | 'es'): Map<string, string> {
  const catalog = JSON.parse(readFileSync(`translations/${language}.json`, 'utf8')) as Translation[];
  return new Map(catalog.map(({ key, value }) => [key, value]));
}

test('ships Spanish CRM integration labels for Spanish-language accounts', () => {
  const es = translationsFor('es');

  assert.equal(es.get('settings.api_access.dialog.environment'), 'Entorno');
  assert.equal(es.get('settings.api_access.dialog.sandbox'), 'Pruebas');
  assert.equal(es.get('settings.api_access.dialog.production'), 'Producción');
  assert.equal(es.get('integrations.operations.pending_events'), 'Eventos pendientes');
  assert.equal(es.get('integrations.operations.needs_attention'), 'Requiere atención');
  assert.equal(es.get('integrations.operations.pending_review'), 'Pendiente de revisión');
  assert.equal(es.get('settings.api_access.operations.data_availability'), 'Todavía no hay registros de integración CRM disponibles. La disponibilidad se basa en las claves API CRM activas y su uso registrado.');
});

test('ships English CRM integration labels for English-language accounts', () => {
  const en = translationsFor('en');

  assert.equal(en.get('settings.api_access.dialog.environment'), 'Environment');
  assert.equal(en.get('settings.api_access.dialog.sandbox'), 'Sandbox');
  assert.equal(en.get('settings.api_access.dialog.production'), 'Production');
  assert.equal(en.get('integrations.operations.pending_events'), 'Pending events');
  assert.equal(en.get('integrations.operations.needs_attention'), 'Needs attention');
  assert.equal(en.get('integrations.operations.pending_review'), 'Pending review');
  assert.equal(en.get('settings.api_access.operations.data_availability'), 'No CRM integration records are available yet. Availability is based on active CRM API keys and their recorded use.');
});

test('ships every CRM operations and API-access label used by the integration UI', () => {
  const sources = [
    'client/src/components/settings/ApiAccessTab.tsx',
    'client/src/components/integrations/IntegrationOperationsView.tsx',
  ].map((path) => readFileSync(resolve(path), 'utf8'));
  const keys = new Set<string>();

  for (const source of sources) {
    for (const match of source.matchAll(/t\('(settings\.api_access|integrations\.operations)\.([^']+)'/g)) {
      keys.add(`${match[1]}.${match[2]}`);
    }
  }

  assert.ok(keys.size > 0, 'the audit must find CRM/API translation keys');

  for (const language of ['en', 'es'] as const) {
    const translations = translationsFor(language);
    for (const key of keys) {
      assert.ok(
        translations.get(key)?.trim(),
        `${language} must translate ${key} instead of showing its English fallback`,
      );
    }
  }
});

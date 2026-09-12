import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApiV2OpenApiDocument } from '../server/routes/api-v2-openapi';
import { getApiV2PostmanCollection } from '../server/routes/api-v2-postman';
import { API_V2_GUIDE_MARKDOWN } from '../server/routes/api-v2-guide';

export type ApiDocumentationCheck = {
  errors: string[];
  routesChecked: number;
};

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routerSourcePath = path.join(repositoryRoot, 'server/routes/api-v2.ts');
const smartBcGuidePath = path.join(repositoryRoot, 'docs/integrations/smartbc-zinto-api-v2.md');

function routePathsFromRouterSource(): string[] {
  const source = fs.readFileSync(routerSourcePath, 'utf8');
  const paths = new Set<string>();
  const routePattern = /router\.(?:get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(routePattern)) paths.add(match[1]);
  return [...paths].sort();
}

function normalizeRoutePath(route: string): string {
  return route.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function postmanRawUrls(value: unknown): string[] {
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value)) return value.flatMap(postmanRawUrls);
  const record = value as Record<string, unknown>;
  const urls = typeof (record.url as { raw?: unknown } | undefined)?.raw === 'string'
    ? [String((record.url as { raw: string }).raw)]
    : [];
  return [...urls, ...Object.values(record).flatMap(postmanRawUrls)];
}

function hasIntegrationHeader(operation: unknown): boolean {
  const parameters = (operation as { parameters?: Array<{ name?: string }> } | undefined)?.parameters ?? [];
  return parameters.some((parameter) => parameter.name === 'X-Zinto-Integration-Id');
}

export function verifyApiDocumentation(): ApiDocumentationCheck {
  const errors: string[] = [];
  const routerPaths = routePathsFromRouterSource();
  const openApi = getApiV2OpenApiDocument() as {
    paths: Record<string, Record<string, unknown>>;
  };
  const openApiPaths = Object.keys(openApi.paths).sort();
  const guide = API_V2_GUIDE_MARKDOWN;
  const smartBcGuide = fs.readFileSync(smartBcGuidePath, 'utf8');
  const postmanCollection = getApiV2PostmanCollection();
  const postman = JSON.stringify(postmanCollection);
  const postmanPaths = postmanRawUrls(postmanCollection)
    .map((raw) => raw.replace(/^\{\{baseUrl\}\}/, '').replace(/^\/api\/v2/, '').replace(/\{\{[^}]+\}\}/g, '{externalId}'));

  for (const route of routerPaths) {
    const normalizedRoute = normalizeRoutePath(route);
    if (!openApi.paths[normalizedRoute]) errors.push(`Ruta ${normalizedRoute} existe en api-v2.ts pero falta en OpenAPI`);
    if (!guide.includes(normalizedRoute)) errors.push(`Ruta ${normalizedRoute} existe en api-v2.ts pero falta en guide.md`);
    if (!smartBcGuide.includes(normalizedRoute)) errors.push(`Ruta ${normalizedRoute} existe en api-v2.ts pero falta en la guía SmartBC`);
  }

  for (const route of openApiPaths) {
    if (!routerPaths.some((routerPath) => normalizeRoutePath(routerPath) === route)) errors.push(`Ruta ${route} existe en OpenAPI pero no en api-v2.ts`);
  }

  const publicOnly = new Set(['/health', '/openapi.json', '/postman.json', '/guide.md']);
  for (const route of routerPaths) {
    const normalizedRoute = normalizeRoutePath(route);
    if (publicOnly.has(route) || route === '/capabilities') continue;
    const operation = Object.values(openApi.paths[normalizedRoute] ?? {})[0];
    if (!hasIntegrationHeader(operation)) {
      errors.push(`Ruta protegida ${normalizedRoute} no declara X-Zinto-Integration-Id en OpenAPI`);
    }
    if (!postmanPaths.includes(normalizedRoute)) {
      errors.push(`Ruta ${normalizedRoute} falta en la colección Postman`);
    }
  }

  if (!openApi.paths['/openapi.json'] || !openApi.paths['/postman.json'] || !openApi.paths['/guide.md']) {
    errors.push('Las tres descargas oficiales deben estar declaradas en OpenAPI');
  }
  if (!guide.includes('Ver secreto') || !guide.includes('Regenerar secreto')) {
    errors.push('guide.md debe explicar cómo consultar y regenerar el secreto del webhook');
  }
  if (!smartBcGuide.includes('type="text"') || !smartBcGuide.includes('Nunca coloque')) {
    errors.push('La guía SmartBC debe exigir Integration ID como texto y nunca en la URL');
  }

  return { errors: [...new Set(errors)], routesChecked: routerPaths.length };
}

if (process.argv[1]?.endsWith('verify-api-docs.ts')) {
  const result = verifyApiDocumentation();
  if (result.errors.length > 0) {
    console.error(result.errors.map((error) => `✗ ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log(`API documentation check passed (${result.routesChecked} v2 routes checked)`);
  }
}

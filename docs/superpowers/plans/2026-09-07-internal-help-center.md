# Internal Help Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build an interactive, in-product Zinto help center with a detailed customer manual and a super-admin-only editorial workflow.

**Architecture:** Persist global help articles, revisions and editorial state in PostgreSQL. Company users read only published articles through /api/help-center; super admins use a separate CRUD route and /admin/help-center. Use typed content blocks rather than arbitrary HTML, so output is safe and validation occurs before publication.

**Tech Stack:** React, TypeScript, Wouter, TanStack Query, Tailwind/shadcn UI, Express, Drizzle ORM, PostgreSQL, Zod, Node test runner.

**Spec:** docs/superpowers/specs/2026-09-07-internal-help-center-design.md

## Global Constraints

- /help and /help/:slug require any authenticated company session.
- The reader never exposes /admin navigation, drafts, archived articles, audit metadata, passwords, tokens, personal data or unverified API claims.
- /admin/help-center and every editorial API require AdminProtectedRoute and server-side req.user.isSuperAdmin.
- Article blocks are structured text, ordered lists, notes and internal links. Do not render author HTML or remote Markdown.
- Publishing requires unique slug, title, summary, category, one audience and one content block.
- The GPT is optional and must use target="_blank" rel="noopener noreferrer".
- Keep the existing help-support URL setting/API, but remove it from the company sidebar path.
- API reference must show “Referencia en preparación” until routes, contracts and a demo-company test validate each claim.

---

## File Structure

- shared/help-center.ts: Zod schemas, content types, categories, seed articles and publication validation.
- shared/schema.ts: Drizzle tables for global articles and audit revisions.
- migrations/231-create-help-center.sql: database schema and indexes.
- server/routes/help-center.ts: reader and super-admin editorial HTTP endpoints.
- server/routes.ts: router registration.
- client/src/lib/help-center-search.ts: deterministic text normalization/filtering.
- client/src/components/help-center/*: search, cards, safe blocks, editor and revisions.
- client/src/pages/help-center.tsx: interactive manual landing/results.
- client/src/pages/help-article.tsx: article reader/not-found state.
- client/src/pages/admin/help-center.tsx: editorial console.
- client/src/App.tsx: route registration.
- client/src/components/layout/Sidebar.tsx: internal help navigation.
- tests/help-center.test.ts: Node tests for contracts, search and policy helpers.
- docs/help-center/editorial-checklist.md: repeatable publication QA.

### Task 1: Establish the safe article contract and search

**Files:**
- Create: shared/help-center.ts
- Create: client/src/lib/help-center-search.ts
- Create: tests/help-center.test.ts

**Interfaces:**
- Produces: HelpAudience, HelpArticleStatus, HelpContentBlock, HelpArticleInput, HelpArticleRecord, helpArticleInputSchema, normalizeHelpSlug, validatePublishableArticle, HELP_CATEGORIES, INITIAL_HELP_ARTICLES.
- Produces: normalizeHelpSearchText(value: string): string and searchHelpArticles(articles, query, filters): HelpArticleRecord[].

- [ ] **Step 1: Write the failing schema and search test**

~~~ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublishableArticle } from '../shared/help-center';
import { searchHelpArticles } from '../client/src/lib/help-center-search';

test('publishing requires all mandatory fields', () => {
  const result = validatePublishableArticle({ slug: 'crear-contacto', title: '', summary: '', category: '', audiences: [], blocks: [] });
  assert.equal(result.success, false);
  assert.match(result.error.message, /título|resumen|categoría|audiencia|contenido/i);
});

test('search is accent-insensitive and honors audience', () => {
  const articles = [{ id: 1, slug: 'crear-contacto', title: 'Crear un contacto', summary: 'Alta manual', category: 'contactos', audiences: ['user'], tags: ['CRM'], blocks: [{ type: 'ordered_list', items: ['Pulsa Añadir contacto.'] }], status: 'published' }];
  assert.deepEqual(searchHelpArticles(articles, 'anadir', { audience: 'user' }).map((x) => x.slug), ['crear-contacto']);
  assert.deepEqual(searchHelpArticles(articles, 'anadir', { audience: 'developer' }), []);
});
~~~

- [ ] **Step 2: Verify the test fails before implementation**

Run: node --import tsx --test tests/help-center.test.ts

Expected: FAIL because the shared contract and search module do not exist.

- [ ] **Step 3: Implement the typed model and pure search**

~~~ts
export const helpContentBlockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string().trim().min(1) }),
  z.object({ type: z.literal('ordered_list'), items: z.array(z.string().trim().min(1)).min(1) }),
  z.object({ type: z.literal('note'), tone: z.enum(['info', 'warning']), text: z.string().trim().min(1) }),
  z.object({ type: z.literal('internal_link'), slug: z.string().trim().min(1), label: z.string().trim().min(1) }),
]);

export function normalizeHelpSearchText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
}
~~~

Implement validatePublishableArticle with safeParse, returning one Spanish message containing every missing mandatory field. Add category definitions and seed verified articles plus clearly labelled API-preparation articles.

- [ ] **Step 4: Verify the contract**

Run: node --import tsx --test tests/help-center.test.ts && npm run check

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add shared/help-center.ts client/src/lib/help-center-search.ts tests/help-center.test.ts
git commit -m "feat: define help center content contract"
~~~

### Task 2: Add storage and protected help APIs

**Files:**
- Modify: shared/schema.ts
- Create: migrations/231-create-help-center.sql
- Create: server/routes/help-center.ts
- Modify: server/routes.ts
- Modify: tests/help-center.test.ts

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces: GET /api/help-center/articles, GET /api/help-center/articles/:slug, GET/POST/PATCH /api/admin/help-center/articles, POST /api/admin/help-center/articles/:id/publish, POST /api/admin/help-center/articles/:id/archive, and GET /api/admin/help-center/articles/:id/revisions.

- [ ] **Step 1: Add failing policy helper tests**

~~~ts
import { canReadArticle, canEditHelpCenter } from '../server/routes/help-center';

test('reader output excludes drafts and archived content', () => {
  assert.equal(canReadArticle({ status: 'published' }), true);
  assert.equal(canReadArticle({ status: 'draft' }), false);
  assert.equal(canReadArticle({ status: 'archived' }), false);
});

test('only a super administrator edits global help', () => {
  assert.equal(canEditHelpCenter({ isSuperAdmin: true }), true);
  assert.equal(canEditHelpCenter({ isSuperAdmin: false }), false);
});
~~~

- [ ] **Step 2: Verify the tests fail**

Run: node --import tsx --test tests/help-center.test.ts

Expected: FAIL because the route module does not exist.

- [ ] **Step 3: Implement migration, records and endpoints**

~~~ts
export const helpArticles = pgTable('help_articles', {
  id: serial('id').primaryKey(),
  slug: varchar('slug', { length: 160 }).notNull().unique(),
  title: varchar('title', { length: 255 }).notNull(),
  summary: text('summary').notNull(),
  category: varchar('category', { length: 80 }).notNull(),
  audiences: jsonb('audiences').notNull(),
  tags: jsonb('tags').notNull().default([]),
  blocks: jsonb('blocks').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('draft'),
  verificationStatus: varchar('verification_status', { length: 24 }).notNull().default('unverified'),
  publishedAt: timestamp('published_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
~~~

Add help_article_revisions with article id, action, snapshot JSON, actor user id and timestamp. The migration must include the three-value status check, unique slug and (status, category) index. Validate writes with Task 1’s Zod schema. Return 400 before publish on invalid input, 403 before every editorial query for non-super-admins, and append an audit record in the same transaction for create/update/publish/archive. Register the router in server/routes.ts.

- [ ] **Step 4: Verify persistence boundary**

Run: npm run db:migrate:validate && node --import tsx --test tests/help-center.test.ts && npm run check

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add shared/schema.ts migrations/231-create-help-center.sql server/routes/help-center.ts server/routes.ts tests/help-center.test.ts
git commit -m "feat: add help center content API"
~~~

### Task 3: Implement the interactive company manual

**Files:**
- Create: client/src/components/help-center/help-search.tsx
- Create: client/src/components/help-center/help-category-card.tsx
- Create: client/src/components/help-center/help-article-card.tsx
- Create: client/src/components/help-center/help-article-content.tsx
- Create: client/src/pages/help-center.tsx
- Create: client/src/pages/help-article.tsx
- Modify: client/src/App.tsx
- Modify: client/src/components/layout/Sidebar.tsx
- Modify: tests/help-center.test.ts

**Interfaces:**
- Consumes: Task 1 search helpers and Task 2 reader APIs.
- Produces: routes /help and /help/:slug plus internal sidebar navigation.

- [ ] **Step 1: Add failing safe-link tests**

~~~ts
import { getSafeHelpLinkTarget, visibleHelpBlocks } from '../client/src/components/help-center/help-article-content';

test('article renderer exposes only internal article links', () => {
  assert.equal(getSafeHelpLinkTarget('crear-contacto'), '/help/crear-contacto');
  assert.equal(getSafeHelpLinkTarget('https://evil.example'), null);
  assert.equal(visibleHelpBlocks([{ type: 'paragraph', text: 'Paso 1' }]).length, 1);
});
~~~

- [ ] **Step 2: Verify the test fails**

Run: node --import tsx --test tests/help-center.test.ts

Expected: FAIL because the safe renderer module does not exist.

- [ ] **Step 3: Implement reader and navigation**

~~~tsx
<Link href="/help" className={navItemClass(location.startsWith('/help'), !isCollapsed)}>
  <i className="ri-question-answer-line text-xl" />
  <span className={navLabelClass}>{t('nav.help_support', 'Help & Support')}</span>
</Link>
~~~

Fetch with TanStack Query keys ['help-center', 'articles'] and ['help-center', 'article', slug]. Search title, summary, audience, category, tags and block text. Add audience/category filters, first-step cards, responsive category cards, skeletons, a clear-filters no-results state, breadcrumbs, prerequisites, expected result, cautions and related links. Safe-render only known blocks and resolve links to published slugs. Wrap reader routes in ProtectedRoute without a feature permission. Remove helpSupportData and getHelpSupportUrl only from Sidebar.tsx. Add the optional assistant anchor with the required security attributes.

- [ ] **Step 4: Verify the customer experience compiles**

Run: node --import tsx --test tests/help-center.test.ts && npm run check && npm run build:production

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add client/src/components/help-center client/src/pages/help-center.tsx client/src/pages/help-article.tsx client/src/App.tsx client/src/components/layout/Sidebar.tsx tests/help-center.test.ts
git commit -m "feat: add interactive help center reader"
~~~

### Task 4: Implement the super-admin article editor

**Files:**
- Create: client/src/components/help-center/help-article-form.tsx
- Create: client/src/components/help-center/help-revision-list.tsx
- Create: client/src/pages/admin/help-center.tsx
- Modify: client/src/App.tsx
- Modify: tests/help-center.test.ts

**Interfaces:**
- Consumes: Task 1 article schema and Task 2 editorial endpoints.
- Produces: /admin/help-center protected by AdminProtectedRoute, with draft save, preview, publish, archive and revision history.

- [ ] **Step 1: Add failing client validation tests**

~~~ts
import { buildPublishPayload, editorValidationMessage } from '../client/src/components/help-center/help-article-form';

test('editor keeps incomplete content as draft and explains blocked publication', () => {
  const article = buildPublishPayload({ title: 'Contacto', slug: 'crear-contacto', summary: '', category: 'contactos', audiences: [], blocks: [] });
  assert.equal(article.status, 'draft');
  assert.match(editorValidationMessage(article), /resumen|audiencia|contenido/i);
});
~~~

- [ ] **Step 2: Verify the test fails**

Run: node --import tsx --test tests/help-center.test.ts

Expected: FAIL because the editor module does not exist.

- [ ] **Step 3: Implement editor and revision view**

~~~tsx
<AdminProtectedRoute path="/admin/help-center" component={AdminHelpCenterPage} />
~~~

Create a table filtered by status/category with title, status, verification, author and update date. Implement controlled title, slug, summary, category, audience, tags, prerequisites and typed-block inputs. Add Save draft, Preview, Publish and Archive controls. Preview uses the reader block component and labels unpublished data. Publish shows the same missing-field guidance as the shared validator. Render revisions read-only with action, author, time and snapshot selection. Invalidate both admin and reader query keys after mutations.

- [ ] **Step 4: Verify editor build**

Run: node --import tsx --test tests/help-center.test.ts && npm run check && npm run build:production

Expected: PASS.

- [ ] **Step 5: Commit**

~~~bash
git add client/src/components/help-center/help-article-form.tsx client/src/components/help-center/help-revision-list.tsx client/src/pages/admin/help-center.tsx client/src/App.tsx tests/help-center.test.ts
git commit -m "feat: add help center editorial console"
~~~

### Task 5: Write and validate the detailed initial manual

**Files:**
- Modify: shared/help-center.ts
- Modify: tests/help-center.test.ts
- Create: docs/help-center/editorial-checklist.md

**Interfaces:**
- Consumes: Task 1 contract and Task 2 publication state.
- Produces: detailed Spanish initial articles and future-publication QA.

- [ ] **Step 1: Add failing manual-coverage test**

~~~ts
import { INITIAL_HELP_ARTICLES, REQUIRED_HELP_CATEGORIES } from '../shared/help-center';

test('manual covers product areas without customer-visible admin content', () => {
  const categories = new Set(INITIAL_HELP_ARTICLES.map((article) => article.category));
  assert.equal([...REQUIRED_HELP_CATEGORIES].every((category) => categories.has(category)), true);
  assert.equal(INITIAL_HELP_ARTICLES.some((article) => JSON.stringify(article.blocks).includes('/admin')), false);
});
~~~

- [ ] **Step 2: Verify the test fails until the manual is complete**

Run: node --import tsx --test tests/help-center.test.ts

Expected: FAIL if a required category or initial article is absent.

- [ ] **Step 3: Complete initial Spanish articles and editorial checklist**

Add detailed articles: Primeros pasos; crear/gestionar contactos; conversaciones; asignar/cerrar conversaciones; pipeline; tareas; calendario; crear/publicar flujos; conectar canales; plantillas/campañas; miembros/permisos; analíticas/reportes; ERP según plan; problemas de acceso; and API “Referencia en preparación”. Every how-to includes prerequisites, ordered steps, expected result, a relevant caution/common issue and related links. Use conditional plan/configuration wording for channels, ERP and billing. The checklist requires reproduction in a demo company, removal of secrets/personal data, permission validation, internal-slug validation, publication validation, mobile check and CRM-version/date recording.

- [ ] **Step 4: Run final automated verification**

Run: node --import tsx --test tests/help-center.test.ts && npm run db:migrate:validate && npm run check && npm run build:production

Expected: PASS.

- [ ] **Step 5: Perform manual acceptance**

Open /help as an agent and company admin, then /admin/help-center as a super admin. Verify drafts never appear in the reader, non-super-admin users cannot reach the editor, “añadir” returns relevant results, the GPT opens separately, related links resolve and narrow mobile has no horizontal overflow.

- [ ] **Step 6: Commit**

~~~bash
git add shared/help-center.ts tests/help-center.test.ts docs/help-center/editorial-checklist.md
git commit -m "docs: add initial Zinto help manual"
~~~


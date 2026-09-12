/**
 * P-38 — "is it imported" is not "is it called".
 *
 * ===========================================================================
 * THE FAILURE MODE THIS ANSWERS
 * ===========================================================================
 *
 * Three distinct defects have shipped green in this repository. Two of them
 * already had an instrument:
 *
 *   1. A table exists and nothing queries it.
 *      -> tests/db/control-plane-schema.test.ts (P-36) asserts REFERENCE, not
 *         existence, and KNOWN_ORPHANS is down to one model.
 *   3. Code runs and reports success for work it did not do.
 *      -> caught by tests asserting a durable effect through a real entry
 *         point, which is now every package's standard.
 *
 * The second one had nothing:
 *
 *   2. A module is imported and nobody calls its functions.
 *
 * It cost two sprints. Every one of P-16's nine Sprint 5 deliverables was
 * correct code with no caller -- an escalation ladder nothing escalated
 * through, a `ShadowChannelEffectiveness` table with a reader and a deleter and
 * no writer, an `addToDigest` whose digest was therefore permanently empty.
 * P-17 found five more, including `compliance/redaction.ts` -- the PII/PHI
 * pipeline -- with zero callers while `prisma.shadowMessage.create` appeared in
 * six files, so every transcript was stored raw.
 *
 * Nothing already here could see it. `tsc` is happy: the module type-checks.
 * ESLint is happy: `no-unused-vars` is file-local, and the symbol IS used --
 * by the barrel that re-exports it. The unit suite is happy: the service has
 * tests, and they call it directly.
 *
 * That last one is the trap, and it is why `isTestFile` exists below. A test
 * calling a service is not the product calling a service. `addToDigest` had a
 * unit test and no product caller; so did the escalation ladder; so did
 * `redactionPipeline`. Counting a test as a caller would have turned every one
 * of P-16's and P-17's findings green.
 *
 * ===========================================================================
 * WHY THE SUBJECT IS THE SERVICE SINGLETON AND NOT EVERY EXPORT
 * ===========================================================================
 *
 * `src/` exports roughly 1,760 functions. A naive unused-export report over
 * that is hopeless, and a gate over it would be switched off within a week --
 * which is literally how `continue-on-error` reached the lint step here, and
 * P-19 spent a package removing it.
 *
 * The pattern that actually fails is narrower and countable: the module-scope
 * service singleton, `export const x = new SomethingService()`. There are 42 of
 * them in `src/` (excluding `new Map()` and friends -- see
 * COLLECTION_CONSTRUCTORS). Each exists for exactly one reason: so that other
 * files can call methods on it. A singleton nobody calls from outside its own
 * file has no other possible purpose, which makes the question decidable
 * without judgement.
 *
 * ===========================================================================
 * WHY AN AST AND NOT A GREP
 * ===========================================================================
 *
 * A grep for the name answers "does this string appear", and every one of the
 * things this hunts DOES appear -- in the barrel that re-exports it. The
 * coordinator's measurement was a name-keyed grep: 49 subjects, 30 live, 19
 * dead. This AST-resolved scan says 42 subjects, 29 live, 13 dead, and the two
 * differences are the argument for the rewrite:
 *
 *   - `retentionService` was declared TWICE, in
 *     `modules/security/services/retention-service.ts` (dead) and
 *     `modules/shadow/compliance/retention.ts` (live, via
 *     `app/api/shadow/retention/route.ts` and `lib/queue/shadow-retention.ts`).
 *     Keyed by name, the live one forgives the dead one. Keyed by (file, name)
 *     and resolved through the import that actually binds it, they are two
 *     separate answers. `renderTemplate` is the same story one scope out.
 *
 *     P-43 deleted the security one on the owner's ruling, so the duplicate is
 *     gone and the example now reads in the past tense. The example is kept --
 *     not tidied away -- because it is the argument for resolving imports rather
 *     than grepping identifiers, and that argument does not expire with the
 *     file that motivated it.
 *   - `new Map()` is not a service. Seven of the nineteen were module-private
 *     Maps exported only so a test could `.clear()` them -- `dlpStore`,
 *     `exportStore`, `policyStore`, `ssoStore`, `toolStore`, `importStore`,
 *     `wizardStore` -- in modules whose FUNCTIONS routes call perfectly well
 *     (`/api/admin/dlp` calls `getDLPRules`). Listing those beside
 *     `vaultService` is how a gate earns its first "oh, ignore that one".
 *
 * So: comments cannot lie to it (it parses, it does not match text), a
 * re-export is not a call, an aliased import IS the same symbol, a type-only
 * import is not a use, and a namespace import is followed.
 *
 * ===========================================================================
 * WHAT IT CANNOT SEE -- AND THE SCOPE THAT WAS REFUSED BECAUSE OF IT
 * ===========================================================================
 *
 * `analyze()` also accepts `kinds: ['function']`, which scans every
 * `export function` in `src/modules/<m>/services/`. DO NOT GATE ON IT. It was
 * measured and deliberately not shipped as a gate; the dead end is recorded
 * here so the next package does not rebuild it.
 *
 *   773 exported service functions -- every `export function` under
 *   `src/modules/<m>/services/`, excluding the ten `_`-prefixed test seams --
 *   of which 291 are live and 482 are dead. Twenty were checked by hand and
 *   nineteen were true findings. The twentieth,
 *   `workflows/services/action-handlers.ts :: handleLogFinancial`, RUNS IN
 *   PRODUCTION: it is named in `ACTION_HANDLERS`, a dispatch table in its own
 *   file, and `executeAction` -- which reads that table -- is imported by
 *   `workflow-executor.ts`. No file outside `action-handlers.ts` mentions
 *   `handleLogFinancial`, so this scan calls it dead, and it is not.
 *
 *   That class is not a one-off: 122 of the 482 are referenced a second time
 *   inside their own file, so each needs an intra-file call graph before its
 *   verdict means anything. A 482-entry list with a ~25% suspect band is a gate
 *   people learn to ignore. P-35 hit the same wall from the other side
 *   (import-granular where the question is function-granular), hand-checked two
 *   of 66, found both false, and refused to ship it. Same answer here.
 *
 *   `fixtureDispatchTable()` below reproduces the miss in six lines, and the
 *   suite asserts it, so the limitation is executable rather than prose that
 *   drifts out of date.
 *
 * Singletons are structurally immune to that class: a dispatch table holding
 * `someService` is still a member access or a value use in whatever file reads
 * the table, and both count.
 *
 * One thing the singleton scan reports as live that a human would call dead:
 * `ocrService`'s only caller is `screenshot-service.ts`, and `screenshotService`
 * is itself dead. The verdict here is direct-caller, not root-reachability, so
 * it was live by definition and unreachable in fact. Named in the gate's comment
 * rather than smuggled into the verdict, because widening the definition is what
 * turns a check into a guess.
 *
 * P-43 settled that one by deleting `screenshot-service.ts`: `ocrService` reads
 * `dead` now, with no change to the definition. A transitive-reachability pass
 * would have reported it a package earlier; not having one cost nothing here,
 * because the thing it depended on was itself on the gated list.
 *
 * The same paragraph used to name `legalHoldService` beside it -- "its only
 * caller is security's `retention-service.ts`, which is also dead". That was
 * wrong, and deleting `retention-service.ts` is what proved it: the verdict went
 * to `dynamic`, not `dead`, because `security/services/consent-service.ts` (live
 * via `compliance-service.ts` and `shared/middleware/compliance.ts`) reaches it
 * through `await import('./legal-hold-service')` and always did. The scan was
 * right about it throughout -- a dynamic import is `dynamic`, never `dead`; only
 * the hand-written sentence was wrong.
 */

import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { posix } from 'node:path';

/** A file tree to analyse: absolute POSIX-style path -> source text. */
export type SourceTree = Map<string, string>;

export type SubjectKind = 'singleton' | 'function';

export interface AnalyzeOptions {
  /** Every file considered. Keys must be POSIX-style absolute paths. */
  tree: SourceTree;
  /** What `@/...` resolves to, e.g. `/repo/src`. */
  srcRoot: string;
  /** Only files under these roots may DECLARE a subject. Defaults to [srcRoot]. */
  declarationRoots?: string[];
  /** What to look for. Default: singletons only. */
  kinds?: ReadonlyArray<SubjectKind>;
}

export interface Subject {
  kind: SubjectKind;
  /** The exported binding name. */
  name: string;
  /** POSIX-style absolute path of the declaring file. */
  file: string;
  /** `new VaultService()`, or `function`. */
  detail: string;
}

export interface Reachability {
  subject: Subject;
  /**
   * `live`    — a non-test file outside the declaring file uses it.
   * `dynamic` — only reached through `import()`/`require()` of a module that
   *             exports it. Treated as live: a dynamic import is a use this
   *             scan cannot resolve, and a false "dead" is the expensive kind
   *             of wrong -- the first false positive is what teaches everyone
   *             to ignore the check.
   * `dead`    — nothing outside the declaring file does anything with it but
   *             re-export it.
   */
  verdict: 'live' | 'dynamic' | 'dead';
  /** Non-test files outside the declaring file that use it. */
  callers: string[];
  /** Test files that use it. Deliberately NOT evidence of life. */
  testCallers: string[];
  /** Files that import it and only re-export it. A re-export is not a call. */
  reExportOnly: string[];
}

/**
 * `new Map()` is a data structure, not a service.
 *
 * Seven of these are exported purely as a test seam while the functions around
 * them are reached by routes. Nobody ever intended an outside caller, so "no
 * outside caller" is not a finding about them.
 */
const COLLECTION_CONSTRUCTORS = new Set([
  'Map',
  'Set',
  'WeakMap',
  'WeakSet',
  'Array',
  'Date',
  'RegExp',
  'Error',
  'AbortController',
  'TextEncoder',
  'TextDecoder',
]);

const TS_EXTENSIONS = ['.ts', '.tsx'];

/** Windows hands back backslashes; every path in this module is POSIX-style. */
export function toPosix(path: string): string {
  return path.replace(/\\/g, '/');
}

/** Reads real directory trees into a SourceTree. Skips declaration files. */
export function readTree(...roots: string[]): SourceTree {
  const tree: SourceTree = new Map();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = posix.join(toPosix(dir), entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (TS_EXTENSIONS.some((ext) => full.endsWith(ext)) && !full.endsWith('.d.ts')) {
        tree.set(full, readFileSync(full, 'utf8'));
      }
    }
  };
  for (const root of roots) walk(toPosix(root));
  return tree;
}

/** A test file is not a caller. See the header -- this is the load-bearing line. */
export function isTestFile(file: string): boolean {
  const segments = file.split('/');
  return (
    /\.(test|spec)\.tsx?$/.test(file) ||
    segments.includes('__tests__') ||
    segments.includes('__mocks__')
  );
}

interface ImportBinding {
  local: string;
  /** The name in the target module, `default`, or `*` for a namespace import. */
  imported: string;
  spec: string;
  typeOnly: boolean;
}

interface ReExport {
  exported: string;
  original: string;
  spec: string;
}

interface FileFacts {
  imports: ImportBinding[];
  reExports: ReExport[];
  /**
   * `export { X }` / `export { X as Y }` with no module specifier: still a
   * re-export, still not a call -- and still a link in the alias chain, because
   * `import { x } from './a'; export { x };` is how one barrel here is written.
   */
  localReExports: Array<{ local: string; exported: string }>;
  /** Identifiers in value position, outside every import and export clause. */
  valueUses: Set<string>;
  /** Identifiers whose property was read: `x.foo`, `x['foo']`. */
  memberUses: Set<string>;
  dynamicSpecs: string[];
}

/** The key for one exported binding. `|` cannot occur in these paths or names. */
function bindingKey(file: string, name: string): string {
  return file + '|' + name;
}

function parse(file: string, text: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
}

function collectFacts(sourceFile: ts.SourceFile): FileFacts {
  const facts: FileFacts = {
    imports: [],
    reExports: [],
    localReExports: [],
    valueUses: new Set(),
    memberUses: new Set(),
    dynamicSpecs: [],
  };

  const visit = (node: ts.Node): void => {
    // An import declaration BINDS names; it does not use them. Returning early
    // keeps every identifier in the clause out of `valueUses`.
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const spec = node.moduleSpecifier.text;
      const clause = node.importClause;
      if (clause) {
        const typeOnly = clause.isTypeOnly;
        if (clause.name) {
          facts.imports.push({ local: clause.name.text, imported: 'default', spec, typeOnly });
        }
        const bindings = clause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          facts.imports.push({ local: bindings.name.text, imported: '*', spec, typeOnly });
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            facts.imports.push({
              local: element.name.text,
              imported: element.propertyName ? element.propertyName.text : element.name.text,
              spec,
              typeOnly: typeOnly || element.isTypeOnly,
            });
          }
        }
      }
      return;
    }

    // `export { x } from './y'`, `export * from './y'`, `export { x }`.
    // A re-export is not a call. That is the whole reason a grep was wrong.
    if (ts.isExportDeclaration(node)) {
      const spec =
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : null;
      if (spec) {
        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            facts.reExports.push({
              exported: element.name.text,
              original: element.propertyName ? element.propertyName.text : element.name.text,
              spec,
            });
          }
        } else {
          facts.reExports.push({ exported: '*', original: '*', spec });
        }
      } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) {
          facts.localReExports.push({
            local: element.propertyName ? element.propertyName.text : element.name.text,
            exported: element.name.text,
          });
        }
      }
      return;
    }

    if (ts.isCallExpression(node)) {
      const argument = node.arguments[0];
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require';
      if ((isDynamicImport || isRequire) && argument && ts.isStringLiteral(argument)) {
        facts.dynamicSpecs.push(argument.text);
      }
    }

    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression)) {
      facts.memberUses.add(node.expression.text);
    }
    if (ts.isElementAccessExpression(node) && ts.isIdentifier(node.expression)) {
      facts.memberUses.add(node.expression.text);
    }

    if (ts.isIdentifier(node)) {
      const parent = node.parent;
      const isPropertyName =
        (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isEnumMember(parent) && parent.name === node) ||
        (ts.isBindingElement(parent) && parent.propertyName === node) ||
        ts.isQualifiedName(parent);
      const isDeclarationName =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isClassDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isInterfaceDeclaration(parent) && parent.name === node) ||
        (ts.isTypeAliasDeclaration(parent) && parent.name === node);
      // `const v: VaultService` names a type, not the singleton.
      const isTypePosition = ts.isTypeReferenceNode(parent) || ts.isTypeQueryNode(parent);
      if (!isPropertyName && !isDeclarationName && !isTypePosition) {
        facts.valueUses.add(node.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return facts;
}

function makeResolver(
  tree: SourceTree,
  srcRoot: string
): (fromFile: string, spec: string) => string | null {
  return function resolveSpecifier(fromFile: string, spec: string): string | null {
    let base: string;
    if (spec.startsWith('@/')) base = posix.join(srcRoot, spec.slice(2));
    else if (spec.startsWith('./') || spec.startsWith('../')) {
      base = posix.join(posix.dirname(fromFile), spec);
    } else return null; // a package; never one of our subjects
    const candidates = [
      ...TS_EXTENSIONS.map((ext) => base + ext),
      ...TS_EXTENSIONS.map((ext) => posix.join(base, 'index' + ext)),
    ];
    for (const candidate of candidates) if (tree.has(candidate)) return candidate;
    return null;
  };
}

function isServiceFile(file: string): boolean {
  return /\/src\/modules\/[^/]+\/services\//.test(file);
}

function collectSubjects(
  file: string,
  sourceFile: ts.SourceFile,
  kinds: ReadonlyArray<SubjectKind>
): Subject[] {
  const subjects: Subject[] = [];
  for (const statement of sourceFile.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;

    if (kinds.includes('singleton') && ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!declaration.initializer || !ts.isIdentifier(declaration.name)) continue;
        if (!ts.isNewExpression(declaration.initializer)) continue;
        const constructorName = declaration.initializer.expression.getText(sourceFile);
        if (COLLECTION_CONSTRUCTORS.has(constructorName)) continue;
        subjects.push({
          kind: 'singleton',
          name: declaration.name.text,
          file,
          detail: 'new ' + constructorName + '()',
        });
      }
    }

    if (
      kinds.includes('function') &&
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      isServiceFile(file) &&
      // `_`-prefixed exports are this repository's test-seam convention
      // (`_getCitationStore`, `_resetDNDStore`). They exist FOR tests, so "no
      // product caller" is their design and not a defect.
      !statement.name.text.startsWith('_')
    ) {
      subjects.push({ kind: 'function', name: statement.name.text, file, detail: 'function' });
    }
  }
  return subjects;
}

/**
 * Every `(file, exportedName)` pair denoting the same declaration, by following
 * re-export chains: `export { x } from './a'`, `export * from './a'`, renaming
 * re-exports (`export { executeAction as executeIntegrationAction }`), and the
 * two-statement spelling (`import { x } from './a'; export { x };`).
 *
 * Without this, a caller that imports from a module barrel rather than from the
 * declaring file looks like a caller of nothing.
 */
function aliasClosure(
  subject: Subject,
  factsOf: Map<string, FileFacts>,
  resolveSpecifier: (fromFile: string, spec: string) => string | null
): Set<string> {
  const closure = new Set<string>([bindingKey(subject.file, subject.name)]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [file, facts] of factsOf) {
      for (const { local, exported } of facts.localReExports) {
        if (closure.has(bindingKey(file, exported))) continue;
        for (const binding of facts.imports) {
          if (binding.typeOnly || binding.local !== local) continue;
          const target = resolveSpecifier(file, binding.spec);
          if (target && closure.has(bindingKey(target, binding.imported))) {
            closure.add(bindingKey(file, exported));
            grew = true;
          }
        }
      }
      for (const reExport of facts.reExports) {
        const target = resolveSpecifier(file, reExport.spec);
        if (!target) continue;
        if (reExport.original === '*') {
          for (const existing of [...closure]) {
            const separator = existing.indexOf('|');
            if (existing.slice(0, separator) !== target) continue;
            const name = existing.slice(separator + 1);
            if (!closure.has(bindingKey(file, name))) {
              closure.add(bindingKey(file, name));
              grew = true;
            }
          }
        } else if (
          closure.has(bindingKey(target, reExport.original)) &&
          !closure.has(bindingKey(file, reExport.exported))
        ) {
          closure.add(bindingKey(file, reExport.exported));
          grew = true;
        }
      }
    }
  }
  return closure;
}

/** The scan. Pure: it reads the tree it is handed and nothing else. */
export function analyze(options: AnalyzeOptions): Reachability[] {
  const { tree, srcRoot } = options;
  const kinds = options.kinds ?? (['singleton'] as const);
  const declarationRoots = (options.declarationRoots ?? [srcRoot]).map(toPosix);
  const resolveSpecifier = makeResolver(tree, srcRoot);

  const factsOf = new Map<string, FileFacts>();
  const subjects: Subject[] = [];
  for (const [file, text] of tree) {
    const sourceFile = parse(file, text);
    factsOf.set(file, collectFacts(sourceFile));
    if (isTestFile(file)) continue;
    if (!declarationRoots.some((root) => file.startsWith(root + '/'))) continue;
    subjects.push(...collectSubjects(file, sourceFile, kinds));
  }

  return subjects.map((subject) => {
    const closure = aliasClosure(subject, factsOf, resolveSpecifier);
    const closureFiles = new Set([...closure].map((e) => e.slice(0, e.indexOf('|'))));
    const closureNames = new Set([...closure].map((e) => e.slice(e.indexOf('|') + 1)));

    const callers: string[] = [];
    const testCallers: string[] = [];
    const reExportOnly: string[] = [];
    let dynamic = false;

    for (const [file, facts] of factsOf) {
      if (file === subject.file) continue;

      for (const spec of facts.dynamicSpecs) {
        const target = resolveSpecifier(file, spec);
        if (target && closureFiles.has(target)) dynamic = true;
      }

      const locals: string[] = [];
      const namespaces: string[] = [];
      for (const binding of facts.imports) {
        if (binding.typeOnly) continue;
        const target = resolveSpecifier(file, binding.spec);
        if (!target) continue;
        if (binding.imported === '*') {
          if (closureFiles.has(target)) namespaces.push(binding.local);
        } else if (closure.has(bindingKey(target, binding.imported))) {
          locals.push(binding.local);
        }
      }
      if (locals.length === 0 && namespaces.length === 0) continue;

      let used = false;
      for (const local of locals) {
        const reExportedHere =
          facts.localReExports.some((r) => r.local === local) && !facts.memberUses.has(local);
        if (facts.memberUses.has(local)) used = true;
        else if (facts.valueUses.has(local) && !reExportedHere) used = true;
      }
      if (!used && namespaces.length > 0) {
        // `import * as security from '...'; security.vaultService.unseal()`.
        // The namespace object is one identifier, so the member read that
        // matters is the second one, which `memberUses` does not key by name.
        const text = tree.get(file) ?? '';
        for (const namespace of namespaces) {
          for (const name of closureNames) {
            if (new RegExp('\\b' + namespace + '\\s*\\.\\s*' + name + '\\b').test(text)) {
              used = true;
            }
          }
        }
      }

      if (used) (isTestFile(file) ? testCallers : callers).push(file);
      else reExportOnly.push(file);
    }

    // A pure `export { x } from './x'` barrel never IMPORTS the binding, so the
    // loop above skips it entirely -- and it is the single most common thing
    // standing between a dead service and a grep that calls it live. Name it,
    // so the failure says "its only reference is a barrel re-export" instead of
    // "unreferenced", which is what a reader would go and disprove in a second.
    for (const file of closureFiles) {
      if (file === subject.file) continue;
      if (callers.includes(file) || testCallers.includes(file) || reExportOnly.includes(file)) {
        continue;
      }
      reExportOnly.push(file);
    }

    const verdict: Reachability['verdict'] =
      callers.length > 0 ? 'live' : dynamic ? 'dynamic' : 'dead';
    return { subject, verdict, callers, testCallers, reExportOnly };
  });
}

/** `path/to/file.ts :: name` — the identity KNOWN_DEAD is written in. */
export function identify(subject: Subject, repoRoot: string): string {
  const root = toPosix(repoRoot);
  const file = subject.file.startsWith(root + '/')
    ? subject.file.slice(root.length + 1)
    : subject.file;
  return file + ' :: ' + subject.name;
}

// ===========================================================================
// FIXTURES — the mutation tests run off these, not off the real tree, so they
// keep proving what they prove after the real tree changes.
// ===========================================================================

/**
 * The exact shape of `vaultService`: declared, re-exported by a barrel, called
 * by nothing. A check that does not flag this is not a check.
 */
export function fixtureBarrelOnly(): { tree: SourceTree; srcRoot: string } {
  return {
    srcRoot: '/repo/src',
    tree: new Map([
      [
        '/repo/src/modules/security/services/vault-service.ts',
        'export class VaultService { unseal() { return 1; } }\n' +
          'export const vaultService = new VaultService();',
      ],
      [
        '/repo/src/modules/security/index.ts',
        "export { VaultService, vaultService } from './services/vault-service';",
      ],
    ]),
  };
}

/** The same tree, plus one route that actually calls it. */
export function fixtureWithRouteCaller(): { tree: SourceTree; srcRoot: string } {
  const { tree, srcRoot } = fixtureBarrelOnly();
  tree.set(
    '/repo/src/app/api/security/vault/route.ts',
    "import { vaultService } from '@/modules/security';\n" +
      'export async function GET() { return Response.json(await vaultService.unseal()); }'
  );
  return { tree, srcRoot };
}

/**
 * The known-false cases in one tree: a renamed import through a barrel, a
 * namespace import, a caller in `scripts/` rather than a route, a type-only
 * import alongside a real one, a two-statement re-export chain, a dynamic
 * `import()`, and a service whose only caller is its own test.
 */
export function fixtureKnownFalse(): {
  tree: SourceTree;
  srcRoot: string;
  declarationRoots: string[];
} {
  return {
    srcRoot: '/repo/src',
    declarationRoots: ['/repo/src'],
    tree: new Map([
      [
        '/repo/src/services/aliased.ts',
        'export class A { go() {} }\nexport const aliasedService = new A();',
      ],
      ['/repo/src/services/index.ts', "export { aliasedService as renamed } from './aliased';"],
      [
        '/repo/src/app/api/aliased/route.ts',
        "import { renamed } from '@/services';\nexport function GET() { renamed.go(); }",
      ],

      [
        '/repo/src/services/namespaced.ts',
        'export class N { go() {} }\nexport const namespacedService = new N();',
      ],
      [
        '/repo/src/app/api/namespaced/route.ts',
        "import * as services from '@/services/namespaced';\n" +
          'export function GET() { services.namespacedService.go(); }',
      ],

      [
        '/repo/src/services/worker-only.ts',
        'export class W { go() {} }\nexport const workerOnlyService = new W();',
      ],
      [
        '/repo/scripts/worker.ts',
        "import { workerOnlyService } from '../src/services/worker-only';\n" +
          'workerOnlyService.go();',
      ],

      [
        '/repo/src/services/typed.ts',
        'export class T { go() {} }\nexport const typedService = new T();',
      ],
      [
        '/repo/src/app/api/typed/route.ts',
        "import type { T } from '@/services/typed';\n" +
          "import { typedService } from '@/services/typed';\n" +
          'export function GET(): T | null { typedService.go(); return null; }',
      ],

      [
        '/repo/src/services/longhand.ts',
        'export class L { go() {} }\nexport const longhandService = new L();',
      ],
      [
        '/repo/src/services/longhand-barrel.ts',
        "import { longhandService } from './longhand';\nexport { longhandService };",
      ],
      [
        '/repo/src/app/api/longhand/route.ts',
        "import { longhandService } from '@/services/longhand-barrel';\n" +
          'export function GET() { longhandService.go(); }',
      ],

      [
        '/repo/src/services/lazy.ts',
        'export class Z { go() {} }\nexport const lazyService = new Z();',
      ],
      [
        '/repo/src/app/api/lazy/route.ts',
        'export async function GET() {\n' +
          "  const mod = await import('@/services/lazy');\n" +
          '  return Response.json(mod);\n' +
          '}',
      ],

      [
        '/repo/src/services/tested-only.ts',
        'export class TO { go() {} }\nexport const testedOnlyService = new TO();',
      ],
      [
        '/repo/src/services/__tests__/tested-only.test.ts',
        "import { testedOnlyService } from '../tested-only';\n" +
          "it('works', () => { testedOnlyService.go(); });",
      ],
    ]),
  };
}

/**
 * The scope-2 dead end in six lines: a handler reached only through a dispatch
 * table in its own file, whose reader IS imported elsewhere. The function scan
 * calls `handleThing` dead and it runs in production. See the header.
 */
export function fixtureDispatchTable(): { tree: SourceTree; srcRoot: string } {
  return {
    srcRoot: '/repo/src',
    tree: new Map([
      [
        '/repo/src/modules/workflows/services/action-handlers.ts',
        'export async function handleThing() { return 1; }\n' +
          'const HANDLERS = { THING: handleThing };\n' +
          "export async function executeAction(type: 'THING') { return HANDLERS[type](); }",
      ],
      [
        '/repo/src/modules/workflows/services/workflow-executor.ts',
        "import { executeAction } from './action-handlers';\n" +
          "export function run() { return executeAction('THING'); }",
      ],
    ]),
  };
}

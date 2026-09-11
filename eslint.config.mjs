import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // -------------------------------------------------------------------------
  // P-34 — the Shadow tool router may not hold a database client.
  //
  // `tool-router.ts` registers the tools Claude may call, with inputs the MODEL
  // generates. Eleven of them queried Prisma on an id taken straight out of
  // that input with no entity filter, so a prompt injection naming another
  // tenant's row reached the database. Every query now goes through
  // `ShadowEntityScope` (src/modules/shadow/agent/entity-scope.ts), which holds
  // a VerifiedEntityId privately and merges it into the `where` itself.
  //
  // That is only durable if the short cut stays closed. This rule is the thing
  // that keeps a tool added next month correct BY DEFAULT rather than by
  // discipline: reaching for `prisma` in that file is a lint error, and
  // `npx eslint src` gates CI. It is scoped to the one file rather than the
  // module because `context-engine.ts` legitimately reads the user record and
  // the session transcript, neither of which is entity-scoped.
  // -------------------------------------------------------------------------
  {
    files: ["src/modules/shadow/agent/tool-router.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "The Shadow tool router must not query Prisma directly: tool inputs are LLM-generated. Add a method to ShadowEntityScope in src/modules/shadow/agent/entity-scope.ts, which scopes every query to the verified active entity.",
            },
            {
              name: "@prisma/client",
              message:
                "The Shadow tool router must not query Prisma directly. See src/modules/shadow/agent/entity-scope.ts.",
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // P-17 — two Shadow tables have exactly one permitted writer each.
  //
  // ShadowMessage -> src/modules/shadow/compliance/message-store.ts
  //   v3 Addition 9.2 says "Every transcript passes through redaction BEFORE
  //   being stored in the database", and `compliance/redaction.ts` opens with
  //   the same sentence. It had ZERO callers, and `prisma.shadowMessage.create`
  //   appeared in six files, so every transcript was stored raw. Redaction now
  //   lives inside `storeShadowMessage`, and a seventh write path added later
  //   would silently reopen the hole -- unless reaching for the delegate
  //   directly is a lint error, which is what this rule makes it.
  //
  // ShadowConsentReceipt -> src/modules/shadow/safety/consent-receipt.ts
  //   `consentReceiptService.createReceipt` enriches a receipt from
  //   `classifyAction`, so `confirmationLevel`, `blastRadius` and `reversible`
  //   come from one table. `agent/core.ts` bypassed it with a direct create and
  //   filled those three fields from the intent classifier and a hardcoded
  //   three-element set instead -- so the audit record of a created calendar
  //   event said "external, irreversible". A consent receipt whose safety
  //   metadata was decided by the call site is not an audit record.
  //
  // Scoped by `files` + `ignores` rather than by trusting review, for the same
  // reason as the P-34 block above. `selector` is a chained member expression
  // so it matches `prisma.shadowMessage.create` and
  // `prisma.shadowMessage.createMany` wherever the client is named `prisma`.
  // -------------------------------------------------------------------------
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: [
      "src/modules/shadow/compliance/message-store.ts",
      "src/modules/shadow/safety/consent-receipt.ts",
      // The synthetic monitor writes and immediately deletes a fixed probe
      // string of its own ("Synthetic test message - please ignore"). It is not
      // a transcript and carries no user content, and routing a liveness probe
      // through the redaction pipeline would make the probe test the pipeline
      // rather than the database. Exempted explicitly so the exemption is
      // visible rather than implicit in a narrower `files` glob.
      "src/modules/shadow/monitoring/synthetic-tests.ts",
    ],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "MemberExpression[object.object.name='prisma'][object.property.name='shadowMessage'][property.name=/^create(Many)?$/]",
          message:
            "ShadowMessage has one writer: storeShadowMessage() in src/modules/shadow/compliance/message-store.ts. It redacts PII/PHI/PCI before storage (v3 Addition 9.2); a direct create stores the transcript raw.",
        },
        {
          selector:
            "MemberExpression[object.object.name='prisma'][object.property.name='shadowConsentReceipt'][property.name=/^create(Many)?$/]",
          message:
            "ShadowConsentReceipt has one writer: consentReceiptService.createReceipt() in src/modules/shadow/safety/consent-receipt.ts. It derives confirmationLevel, blastRadius and reversible from classifyAction(); a direct create lets the call site invent its own safety metadata.",
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // P-39 — the raw Anthropic client is a metering bypass.
  //
  // `src/lib/ai/client.ts` is the seam every model call goes through, and since
  // P-39 every function in it ends in `recordAiUsage`, which writes a durable
  // `UsageRecord` row. It also exports `anthropic` itself -- the SDK client --
  // and 96 files import from that module or its barrel. A call made through the
  // raw client skips the ledger entirely and leaves no trace that it happened,
  // which is exactly the state the whole platform was in before P-39: P-38's
  // reachability scan found `src/lib/ai/usage.ts` imported by NOTHING, so not
  // one Anthropic call this platform made was metered.
  //
  // Three files held that bypass -- `shadow/agent/core.ts`,
  // `intent-classifier.ts` and `outcome-extractor.ts`, which between them are
  // the agent's entire model path -- and now call `createMessage`, the metered
  // equivalent that takes attribution as a required argument.
  //
  // This is the same instrument P-34 used to keep `@/lib/db` out of the Shadow
  // tool router and P-17 used to give `ShadowMessage` and `ShadowConsentReceipt`
  // one permitted writer each: a rule, not a review convention, so that the
  // call added next month is metered BY DEFAULT. `npx eslint src` gates CI.
  //
  // `@anthropic-ai/sdk` is restricted alongside it, because constructing a
  // second client is the same bypass with an extra line. Nothing outside
  // `src/lib/ai/` imports it today; the rule keeps it that way. Types callers
  // legitimately need (`AIMessageCreateParams`, `AIMessageResponse`) are
  // re-exported from the seam so a type import is never a reason to reach past
  // it.
  //
  // Scoped by `ignores` on the seam's own directory rather than by trusting
  // review, for the same reason as the two blocks above.
  //
  // IT USES `@typescript-eslint/no-restricted-imports`, NOT THE BASE RULE, AND
  // THAT IS LOAD-BEARING. In flat config the last config object that matches a
  // file wins for a given rule NAME. This block matches `src/**/*.ts`, which
  // includes `src/modules/shadow/agent/tool-router.ts`, so writing it as the
  // base `no-restricted-imports` would silently replace P-34's `@/lib/db` ban
  // on that file -- reopening the prompt-injection hole P-34 closed, with no
  // error and a green lint run. The two rules have different names, so both
  // apply. Do not "simplify" this by merging them.
  // -------------------------------------------------------------------------
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    ignores: ["src/lib/ai/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/ai",
              importNames: ["anthropic", "default"],
              message:
                "The raw Anthropic client is unmetered: a call through it writes no UsageRecord row, so the spend is invisible. Use createMessage(params, attribution) from @/lib/ai — or generateText/generateJSON/chat/streamText with entityId, userId and module in AIOptions. See src/lib/ai/metering.ts.",
            },
            {
              name: "@/lib/ai/client",
              importNames: ["anthropic", "default"],
              message:
                "The raw Anthropic client is unmetered. Use createMessage(params, attribution) from @/lib/ai. See src/lib/ai/metering.ts.",
            },
            {
              name: "@anthropic-ai/sdk",
              message:
                "Only src/lib/ai/ may construct an Anthropic client; a second one bypasses AI usage metering. Call createMessage() from @/lib/ai, and import AIMessageCreateParams / AIMessageResponse from there for the request and response types.",
            },
          ],
        },
      ],
    },
  },
  // -------------------------------------------------------------------------
  // P-41 — the Shadow session manager may not hold a database client.
  //
  // `interfaces/session-manager.ts` held 13 `prisma.shadowVoiceSession`
  // queries keyed on a bare `{ id: sessionId }` — 7 `findUnique`, 5 `update`,
  // 1 `delete` — and every public method took the session id as a plain string
  // with no user in the signature. A session id is a cuid a client sends in a
  // path segment, so the row crossed the tenancy boundary before anybody
  // checked it, and eleven route files each re-checked
  // `voiceSession.userId !== session.userId` by hand afterwards. Two callers in
  // `interfaces/web-chat.ts` did not: `end_session` and `ping` acted on a
  // caller-supplied id with no ownership check at all.
  //
  // Every query now goes through `OwnedSessionStore`
  // (src/modules/shadow/interfaces/session-store.ts), which holds the owning
  // user id privately and merges it into the `where` itself. This rule is what
  // keeps a method added next month correct BY DEFAULT rather than by
  // discipline: reaching for `prisma` in the manager is a lint error, and
  // `npx eslint` gates CI. Same instrument, same reasoning and the same one-file
  // scope as the P-34 block above — the rest of `interfaces/` legitimately
  // queries other models, and `session-store.ts` is the seam, so neither may be
  // covered.
  //
  // IT USES THE BASE `no-restricted-imports`, AND THE `files` GLOB NAMES ONE
  // FILE, BOTH DELIBERATELY. In flat config the last matching config object
  // wins for a given rule NAME, so:
  //
  //   - `no-restricted-imports` is safe here only because P-34's block covers
  //     `tool-router.ts` and this one covers `session-manager.ts`. The two
  //     globs are disjoint, so neither shadows the other. Widening this glob
  //     to `src/**` would silently delete P-34's `@/lib/db` ban and reopen the
  //     prompt-injection hole with a green lint run — P-39's lesson, recorded
  //     in the block above.
  //   - `no-restricted-syntax` is NOT used here for the same reason in the
  //     other direction: P-17's block sets it over `src/**/*.ts`, and any block
  //     of mine setting that rule name would replace P-17's `ShadowMessage` and
  //     `ShadowConsentReceipt` single-writer bans for whatever files it
  //     matched. An import ban achieves the same guarantee with no collision.
  // -------------------------------------------------------------------------
  {
    files: ["src/modules/shadow/interfaces/session-manager.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/db",
              message:
                "The Shadow session manager must not query Prisma directly: a ShadowVoiceSession addressed by id alone is a cross-tenant read. Add a method to OwnedSessionStore in src/modules/shadow/interfaces/session-store.ts, which merges the owning userId into every where clause.",
            },
            {
              name: "@prisma/client",
              message:
                "The Shadow session manager must not query Prisma directly. See src/modules/shadow/interfaces/session-store.ts.",
            },
          ],
        },
      ],
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;

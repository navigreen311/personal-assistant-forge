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

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

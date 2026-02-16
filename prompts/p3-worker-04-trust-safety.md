# Worker 04: Fix Trust-Safety Services

## Branch

`ai-feature/p3-w04-trust-safety`

Create and check out this branch from the current HEAD before starting any work.

## Owned Paths (ONLY modify these)

You are strictly limited to creating or modifying files within these paths. Do NOT touch any files outside this list:

- `src/engines/trust-safety/reputation-service.ts`
- `src/engines/trust-safety/impersonation-guard.ts`
- `src/engines/trust-safety/throttle-service.ts`
- `tests/unit/engines/trust-safety-reputation.test.ts` (create)
- `tests/unit/engines/trust-safety-throttle.test.ts` (create)

**DO NOT modify:**
- `jest.config.ts`
- `package.json`
- `tsconfig.json`
- `prisma/schema.prisma`
- `src/engines/trust-safety/types.ts`
- `src/engines/trust-safety/fraud-detector.ts`
- `src/engines/trust-safety/injection-firewall.ts`
- `tests/unit/engines/injection-firewall.test.ts`
- Any file outside the Owned Paths

## Context (read these first, do NOT modify)

Before writing any code, read and internalize these files:

1. **`src/engines/trust-safety/types.ts`** -- Defines:
   - `ThreatLevel = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'`
   - `ReputationStatus { channel, identifier, spamScore, warmingProgress?, stirShakenCompliant?, dkimValid?, spfValid?, dmarcValid?, lastChecked }`
   - `EmailHeaderAnalysis { fromDomain, dkimStatus, spfStatus, dmarcStatus, isSpoofed, riskLevel, details }`
   - `ThrottleConfig { actionType, maxPerHour, maxPerDay, requiresApprovalAbove?, cooldownMinutes? }`
   - `ThrottleStatus { actionType, currentHourCount, currentDayCount, maxPerHour, maxPerDay, isThrottled, nextAllowedAt?, requiresApproval }`
   - `ImpersonationSafeguard { consentVerified, watermarkApplied, disclosureIncluded, voiceCloneId?, consentTimestamp? }`

2. **`src/engines/trust-safety/reputation-service.ts`** -- Current implementation:
   - `checkPhoneReputation(phoneNumber)` -- Only checks if starts with `+1555`, uses `Math.random()` for spam scores.
   - `checkEmailReputation(domain)` -- Checks against 4 hardcoded trusted domains, uses `Math.random()` for scores.
   - `analyzeEmailHeaders(headers)` -- Already has real logic for DKIM/SPF/DMARC checking. This is acceptable.
   - `getReputationDashboard(entityId)` -- Returns simulated data.

3. **`src/engines/trust-safety/impersonation-guard.ts`** -- Current implementation:
   - `verifyVoiceCloneConsent(userId, voiceCloneId)` -- Uses in-memory `consentStore` Map. Functional.
   - `applyWatermark(audioContentId)` -- Uses in-memory `watermarkStore` Set. Functional.
   - `generateDisclosure(context)` -- Static lookup map. Functional.
   - `detectImpersonation(baselineMessages, suspectMessage)` -- Uses `generateJSON` from `@/lib/ai`. Already implemented with AI. Functional.
   - `recordConsent(userId, voiceCloneId)` -- Uses in-memory Map. Functional.
   - **Assessment:** Partially implemented. Voice/consent features work but lack text-level impersonation checks (name similarity, homoglyph detection, domain spoofing).

4. **`src/engines/trust-safety/throttle-service.ts`** -- Current implementation:
   - Uses in-memory Maps (`hourlyCounters`, `dailyCounters`) with time-based reset.
   - `getDefaultThrottleConfigs()` -- Returns default configs. Functional.
   - `getThrottleConfig(actionType)` -- Returns config with custom overrides. Functional.
   - `updateThrottleConfig(actionType, config)` -- Updates custom config. Functional.
   - `checkThrottle(userId, actionType)` -- Full implementation with hourly/daily limits, approval checks. Functional.
   - `recordAction(userId, actionType)` -- Increments counters. Functional.
   - `resetThrottle(userId, actionType)` -- Clears counters. Functional.
   - **Assessment:** Fully implemented with sliding window rate limiting. Needs minor improvements.

5. **`src/lib/ai/index.ts`** -- Exports `generateText`, `generateJSON`. Import as: `import { generateJSON } from '@/lib/ai'`.
6. **`tests/unit/engines-def/throttle-service.test.ts`** -- Existing throttle tests (in a different directory). Read for test patterns.

## Requirements

### 1. Fix `reputation-service.ts` -- Replace Random Scores with Heuristic Checks

**Phone reputation (`checkPhoneReputation`):**
Replace `Math.random()` with deterministic, heuristic-based scoring:

- **E.164 format validation:** Check phone starts with `+` followed by 7-15 digits. Invalid format = spamScore 90.
- **Known test/invalid prefixes:** Flag these with high spam scores:
  - `+1555` (US fictional) = spamScore 85
  - `+0` (invalid country code) = spamScore 95
  - `+1900` (US premium rate) = spamScore 80
  - `+44070` (UK personal numbering) = spamScore 75
  - `+234` (Nigeria, high fraud rate) = spamScore 60
  - `+86` (China, high spam rate) = spamScore 55
- **Country code risk tiers:** Assign base scores by risk:
  - Low risk (US +1, UK +44, CA +1, AU +61, DE +49): base spamScore 5-15
  - Medium risk (most other codes): base spamScore 25-35
  - High risk (known high-fraud country codes): base spamScore 50-65
- **Warming progress:** Calculate based on country code tier (low risk = 80-100, medium = 50-70, high = 20-40).
- **STIR/SHAKEN:** Set to `true` for US/CA numbers, `false` for others.
- All scores must be **deterministic** -- the same input always produces the same output.

**Email reputation (`checkEmailReputation`):**
Replace `Math.random()` with deterministic, heuristic-based scoring:

- **Format validation:** Check domain has at least one dot, no spaces, reasonable length. Invalid = spamScore 90.
- **Disposable email domains:** Hardcode the top 50 known disposable email domains:
  ```
  mailinator.com, guerrillamail.com, tempmail.com, throwaway.email, yopmail.com,
  sharklasers.com, guerrillamailblock.com, grr.la, dispostable.com, mailnesia.com,
  trashmail.com, maildrop.cc, fakeinbox.com, tempail.com, tempr.email,
  mailcatch.com, trash-mail.com, mytemp.email, mohmal.com, getnada.com,
  emailondeck.com, temp-mail.org, 10minutemail.com, minutemail.com, email-fake.com,
  crazymailing.com, filzmail.com, inboxbear.com, mailforspam.com, harakirimail.com,
  spamgourmet.com, mailexpire.com, discard.email, deadaddress.com, sogetthis.com,
  mailsac.com, burpcollaborator.net, mailnull.com, jetable.org, trashmail.net,
  spamfree24.org, binkmail.com, spaml.com, uggsrock.com, mailzilla.org,
  bobmail.info, nomail.xl.cx, rmqkr.net, sharklasers.com, spam4.me
  ```
  Disposable domain = spamScore 80.
- **Trusted domains:** Known major providers get low scores:
  - `gmail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, `protonmail.com`, `icloud.com`, `aol.com` = spamScore 5
  - Other `.edu` domains = spamScore 10
  - Other `.gov` domains = spamScore 5
- **Domain heuristics:**
  - Very short domain name (< 4 chars before TLD) = +10 to score
  - Very long domain name (> 30 chars) = +15 to score
  - Domain contains many numbers = +10 to score
  - Known corporate TLDs (.com, .org, .net, .io, .co) = no penalty
  - Unusual TLDs (.xyz, .top, .click, .gq, .cf, .tk, .ml, .ga) = +20 to score
- **DKIM/SPF/DMARC:** For trusted domains, set all to `true`. For disposable, set all to `false`. For unknown, set to `null` (uncertain -- cannot verify without actual DNS lookup).

**`getReputationDashboard(entityId)`:** Remove simulated data. Accept actual phone/email identifiers and return real heuristic results.

### 2. Enhance `impersonation-guard.ts` -- Add Text-Level Checks

Keep all existing functions (voice consent, watermark, disclosure, AI impersonation detection). Add these new exported functions:

**`checkNameSimilarity(name1: string, name2: string): { isSimilar: boolean; distance: number; method: string }`**
- Implement Levenshtein distance calculation.
- Names are similar if distance <= 2 OR if normalized names match (lowercase, trim, remove middle initials).
- Return the distance and method used.

**`detectHomoglyphs(text: string): { hasHomoglyphs: boolean; suspiciousChars: { char: string; unicode: string; lookalike: string }[] }`**
- Check for Unicode homoglyph attacks: Cyrillic characters that look like Latin (e.g., Cyrillic `a` U+0430 vs Latin `a` U+0061).
- Maintain a map of common homoglyph pairs:
  - Cyrillic а(0430)->a, е(0435)->e, о(043E)->o, р(0440)->p, с(0441)->c, у(0443)->y, х(0445)->x
  - Greek ο(03BF)->o, Α(0391)->A, Β(0392)->B, Ε(0395)->E, Η(0397)->H, Ι(0399)->I, Κ(039A)->K, Μ(039C)->M, Ν(039D)->N, Ο(039F)->O, Ρ(03A1)->P, Τ(03A4)->T, Χ(03A7)->X, Ζ(0396)->Z
- Return flagged characters with their Unicode code points and what they look like.

**`checkDomainSpoofing(suspectDomain: string, legitimateDomain: string): { isSpoofed: boolean; technique: string; confidence: number }`**
- Check for common domain spoofing techniques:
  - Typosquatting: Levenshtein distance <= 2 (e.g., `gooogle.com` vs `google.com`).
  - Homoglyph domain: Contains homoglyph characters.
  - Subdomain trick: Suspect contains legitimate domain as subdomain (e.g., `google.com.evil.com`).
  - TLD swap: Same name, different TLD (e.g., `google.co` vs `google.com`).
- Return the detected technique and confidence level.

### 3. Improve `throttle-service.ts`

The throttle service is already well-implemented. Make these minor improvements:

**Add `_resetAllThrottles()` for tests:**
```typescript
export function _resetAllThrottles(): void {
  hourlyCounters.clear();
  dailyCounters.clear();
  customConfigs.clear();
}
```

**Add `getThrottleStatus(userId: string): Promise<ThrottleStatus[]>`:**
- Return throttle status for all configured action types for a given user.
- Useful for dashboard display.

**Add cooldown enforcement to `checkThrottle`:**
- The `cooldownMinutes` field exists in `ThrottleConfig` but is never checked.
- After a throttle is triggered, enforce the cooldown: don't allow new actions until `cooldownMinutes` have passed since the last recorded action.
- Add a `lastActionAt` tracking Map for cooldown support.

### 4. Write Tests

Create two new test files.

**`tests/unit/engines/trust-safety-reputation.test.ts`:**
- `checkPhoneReputation`:
  - Valid US number (+12125551234) returns low spam score.
  - Fictional number (+15551234567) returns high spam score.
  - Invalid format (no + prefix, too short) returns very high spam score.
  - Premium rate number (+19001234567) returns high spam score.
  - High-risk country code (+2341234567890) returns elevated spam score.
  - Same input always returns same score (determinism test).
- `checkEmailReputation`:
  - `gmail.com` returns low spam score with DKIM/SPF/DMARC true.
  - `mailinator.com` returns high spam score (disposable).
  - Invalid domain (no dot, spaces) returns very high spam score.
  - Suspicious TLD (.xyz, .tk) returns elevated score.
  - `.edu` domain returns low score.
  - Same input always returns same score (determinism test).
- `analyzeEmailHeaders`:
  - Headers with valid DKIM/SPF/DMARC return PASS statuses and NONE risk.
  - Missing authentication headers return appropriate MISSING statuses.
  - Mismatched From/Reply-To domains flag spoofing.

**`tests/unit/engines/trust-safety-throttle.test.ts`:**
- `checkThrottle`:
  - Allows action when under hourly limit.
  - Throttles when hourly limit reached.
  - Throttles when daily limit reached.
  - Returns requiresApproval when above approval threshold.
  - Provides nextAllowedAt when throttled.
- `recordAction`:
  - Increments hourly and daily counters.
- `updateThrottleConfig`:
  - Custom config overrides default.
- `_resetAllThrottles`:
  - Clears all counters and custom configs.
- `getThrottleStatus`:
  - Returns status for all action types.
- Cooldown enforcement:
  - Action blocked during cooldown period.
  - Action allowed after cooldown expires.

## Acceptance Criteria

- [ ] `reputation-service.ts` no longer uses `Math.random()` anywhere. All scores are deterministic.
- [ ] Phone reputation checks validate E.164 format and score by prefix/country code risk.
- [ ] Email reputation checks against 50 disposable domains list.
- [ ] Email reputation scores trusted domains (gmail, outlook, etc.) as low risk.
- [ ] `analyzeEmailHeaders` is preserved as-is (already has real logic).
- [ ] `impersonation-guard.ts` has new functions: `checkNameSimilarity`, `detectHomoglyphs`, `checkDomainSpoofing`.
- [ ] All existing impersonation-guard functions are preserved unchanged.
- [ ] `throttle-service.ts` has `_resetAllThrottles`, `getThrottleStatus`, and cooldown enforcement.
- [ ] All existing throttle-service functions are preserved.
- [ ] Import AI as `import { generateJSON } from '@/lib/ai'` (impersonation-guard already does this).
- [ ] All new test files pass.
- [ ] No modifications to `types.ts` or any file outside Owned Paths.

## Implementation Steps

1. Read all Context files to understand existing APIs and type definitions.
2. Update `src/engines/trust-safety/reputation-service.ts`:
   a. Define `DISPOSABLE_DOMAINS` set with 50 entries.
   b. Define `TRUSTED_DOMAINS` map with major providers.
   c. Define `HIGH_RISK_PREFIXES` map with phone prefix -> score mappings.
   d. Define `SUSPICIOUS_TLDS` set with risky TLDs.
   e. Rewrite `checkPhoneReputation` with E.164 validation, prefix checks, country code risk tiers.
   f. Rewrite `checkEmailReputation` with format validation, disposable check, trusted check, domain heuristics.
   g. Update `getReputationDashboard` to use real identifiers (or remove simulation).
   h. Preserve `analyzeEmailHeaders` unchanged.
3. Update `src/engines/trust-safety/impersonation-guard.ts`:
   a. Add `levenshteinDistance(a, b)` helper function.
   b. Add `checkNameSimilarity(name1, name2)` exported function.
   c. Add `HOMOGLYPH_MAP` constant with Cyrillic/Greek lookalikes.
   d. Add `detectHomoglyphs(text)` exported function.
   e. Add `checkDomainSpoofing(suspectDomain, legitimateDomain)` exported function.
   f. Preserve all existing functions unchanged.
4. Update `src/engines/trust-safety/throttle-service.ts`:
   a. Add `lastActionTimestamps` Map for cooldown tracking.
   b. Add `_resetAllThrottles()` exported function.
   c. Add `getThrottleStatus(userId)` exported function.
   d. Update `checkThrottle` to enforce `cooldownMinutes`.
   e. Update `recordAction` to track `lastActionAt`.
5. Create `tests/unit/engines/trust-safety-reputation.test.ts`.
6. Create `tests/unit/engines/trust-safety-throttle.test.ts`.

## Tests Required

- `tests/unit/engines/trust-safety-reputation.test.ts` (create new):
  - Phone reputation: valid US, fictional, invalid format, premium rate, high-risk country, determinism.
  - Email reputation: gmail, disposable, invalid, suspicious TLD, .edu, determinism.
  - Email header analysis: valid auth, missing auth, spoofing detection.

- `tests/unit/engines/trust-safety-throttle.test.ts` (create new):
  - Throttle checks: under limit, hourly exceeded, daily exceeded, approval required.
  - Record action: counter increment.
  - Config update: custom overrides default.
  - Reset: clears all state.
  - Status: returns all action types.
  - Cooldown: blocked during, allowed after.

## Commit Strategy

**Commit 1:** `fix: replace random scores with deterministic heuristics in reputation-service`
- Files: `src/engines/trust-safety/reputation-service.ts`

**Commit 2:** `feat: add name similarity, homoglyph detection, and domain spoofing to impersonation-guard`
- Files: `src/engines/trust-safety/impersonation-guard.ts`

**Commit 3:** `feat: add cooldown enforcement, reset, and status to throttle-service`
- Files: `src/engines/trust-safety/throttle-service.ts`

**Commit 4:** `test: add trust-safety reputation and throttle test suites`
- Files: `tests/unit/engines/trust-safety-reputation.test.ts`, `tests/unit/engines/trust-safety-throttle.test.ts`

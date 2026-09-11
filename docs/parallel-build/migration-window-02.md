# Migration window 02 — authorized by Ivan, 2026-09-11

Window 01 (P-36) is closed. This authorizes three columns and nothing else.

| # | change | owner's ruling |
|---|---|---|
| 1 | `PluginRecord.registryId String?` | *"break-glass should scope to a specific plugin instance, not a name"* — P-37 shipped break-glass keyed on plugin `name`, the only cross-user identity the schema offered, so two tenants with same-named plugins share a kill switch and the name stays burned until an operator deletes the tombstone. |
| 2 | `ContactCallPreference.quietHoursTimezone String?` | *"required, quiet hours without a timezone are meaningless"* — P-16 had the caller supply the **user's** timezone for the **contact's** quiet hours, and said so rather than faking it. |
| 3 | `ShadowConsentReceipt.userId String?` | *"a receipt you can't attribute to a user defeats the entire audit trail. **This one is a bug fix, not a feature.**"* — P-17 detaches receipts from sessions on deletion (correctly, per v3 Addition 9.3), which left a retained receipt attributable to nobody. |

**Ruling 3 is the important one and the framing is the owner's:** the value of a
consent receipt is that it names who authorised the action. P-17 made receipts
outlive their session — which was right — and in doing so exposed that the only
link to a person ran through the session it now survives.

## RULES — carried forward from window 01, which they came from

1. **One migration, one package.** Nobody else may write one.
2. **Additive only.** No column dropped, no type narrowed. All three are
   nullable: there are existing rows in `ShadowConsentReceipt` and
   `ContactCallPreference` in test databases, and 1,079 db tests stand on the
   current schema.
3. **A COLUMN IS NOT DONE WHEN IT EXISTS.** This is window 01's rule and it
   earned its place: P-33 found five of 75 models referenced nowhere, and
   `control-plane-schema.test.ts` stayed green over them because it only counted
   tables. Since P-36 that test asserts *reference*, and since P-38 a second test
   asserts *reachability* — **and P-38 proved reference alone is insufficient**:
   four models pass the reference check because a **dead** service names them.
   So each column here must be **written by the code path that needs it and read
   by the code that acts on it**, proved by a test.
4. **`registryId` must actually narrow break-glass.** A column that exists while
   revocation still matches on `name` is worse than no column — it looks fixed.
   The test must show two tenants with same-named plugins, one revoked, **the
   other still serving**.
5. **`userId` on a consent receipt must survive detachment.** The test must
   delete the session, then assert the retained receipt still names its user.
   That is the entire point of the ruling.
6. **`quietHoursTimezone` must be honoured on read**, not merely stored. P-16's
   `dnc-checker` refuses inside a contact's quiet hours; with this column it must
   compute that window in the **contact's** zone. A stored-but-unread column is
   `DNDConfig.reason` again — the field window 01 had to add `expiresAt` for
   because *no timed do-not-disturb had ever expired*.

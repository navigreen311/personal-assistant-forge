/**
 * P-00b amendment — verifyEntityForUser
 *
 * P-04, the reference implementation, reported that the frozen tenancy interface
 * had no supported way to obtain a VerifiedEntityId outside an HTTP request, so
 * trusted server-side code (workers, cron, webhook pipelines) had to either cast
 * -- forbidden, because a cast is how the mechanism gets hollowed out -- or
 * invent a module-local escape hatch. Nine followers would have invented nine.
 *
 * verifyEntityForUser performs the SAME database ownership check as
 * withEntityScope; it just does not need a NextRequest to do it. That claim is
 * the thing worth testing, so this asserts it against a real database rather
 * than a mock: a mocked Prisma would happily confirm whatever the test wanted.
 *
 * It returns null rather than throwing, so a caller must handle refusal
 * explicitly instead of catching an exception and moving on.
 */

import { setupTestDatabase } from '../helpers/db';
import { createTwoTenants } from '../helpers/factories';
import { verifyEntityForUser } from '@/shared/middleware/auth';

setupTestDatabase();

describe('verifyEntityForUser (P-00b amendment)', () => {
  it('returns the branded id when the user owns the entity', async () => {
    const { tenantA: a } = await createTwoTenants();

    const verified = await verifyEntityForUser(a.entity.id, a.user.id);

    expect(verified).toBe(a.entity.id);
  });

  it('refuses another tenant, which is the whole point', async () => {
    const { tenantA: a, tenantB: b } = await createTwoTenants();

    // A worker holding user A's id must not be able to reach entity B, even
    // though both rows exist and the code is running server-side with full
    // database access. "Trusted context" must not mean "unscoped".
    const verified = await verifyEntityForUser(b.entity.id, a.user.id);

    expect(verified).toBeNull();
  });

  it('refuses an entity that does not exist', async () => {
    const { tenantA: a } = await createTwoTenants();

    expect(await verifyEntityForUser('no-such-entity', a.user.id)).toBeNull();
  });

  it('refuses a user that does not exist', async () => {
    const { tenantA: a } = await createTwoTenants();

    expect(await verifyEntityForUser(a.entity.id, 'no-such-user')).toBeNull();
  });

  it('refuses empty input rather than querying with a blank scope', async () => {
    // An empty string reaching a WHERE clause is how an unscoped query gets
    // written by accident. Refuse before the query, not after it.
    expect(await verifyEntityForUser('', 'user')).toBeNull();
    expect(await verifyEntityForUser('entity', '')).toBeNull();
  });

  it('is not distinguishable between "not yours" and "does not exist"', async () => {
    const { tenantA: a, tenantB: b } = await createTwoTenants();

    // Both return null. A caller cannot use this to probe which entity ids are
    // real, which is the same property P-04 gave deleteProject.
    const foreign = await verifyEntityForUser(b.entity.id, a.user.id);
    const missing = await verifyEntityForUser('no-such-entity', a.user.id);

    expect(foreign).toBeNull();
    expect(missing).toBeNull();
  });
});

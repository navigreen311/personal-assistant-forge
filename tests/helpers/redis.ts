/**
 * P-25 — Redis test isolation.
 *
 * ============================================================================
 * THE BUG THIS FILE EXISTS TO END
 * ============================================================================
 *
 * Five agents and the coordinator hit intermittent failures in three files none
 * of them had touched: `tests/db/queue-worker.test.ts`,
 * `tests/unit/capture/offline-queue.test.ts`, and
 * `src/lib/vaf/streaming/__tests__/audio-playback.test.ts`. Twelve packages had
 * to reason around it. The first two share one cause, and it is not timing.
 *
 * Every Queue and Worker in this platform resolves its Redis target through a
 * single function, `getRedisUrl()` in `src/lib/queue/connection.ts`, and that
 * function returns one fixed address for every process on the machine. BullMQ
 * derives its keys from the queue name alone, so `capture-queue`,
 * `workflow-execution`, `pa-forge-jobs` and `workflow-cron` name the *same
 * Redis keys* in every process that runs. One Memurai, one key space, shared by
 * every jest run, every worktree, and any dev worker that happens to be up.
 *
 * Both suites then "start clean" with `queue.obliterate({ force: true })` --
 * which is a global delete across that key space. One process's fresh start is
 * another process's jobs vanishing mid-flight. The victim sees a `waitFor`
 * deadline expire, or a queue size of 1 where it enqueued 2, in a file it never
 * edited. That is the whole flake.
 *
 * Measured on this machine (i9-14900KF, 32 threads, Memurai on :6379):
 *
 *   tests/unit/capture/offline-queue.test.ts, 3 concurrent jest runs
 *     shared Redis database ....... 16 of 18 lanes failed
 *     one Redis database per lane ..  0 of 18 lanes failed
 *
 *   tests/db/queue-worker.test.ts, 2 concurrent test:db runs (separate Postgres)
 *     shared Redis database ........ 13 of 16 lanes failed
 *     one Redis database per lane ...  0 of 18 lanes failed
 *
 * The discriminator is the shared key space, not machine load: a single jest run
 * under 28 spinning CPU hogs never once failed either file.
 *
 * ============================================================================
 * WHAT THIS FILE DOES
 * ============================================================================
 *
 * It is the `globalSetup` for both jest configs, and it gives each run a Redis
 * target that no other process can be using. Which target depends on which
 * suite is running, and the two answers are deliberately opposite -- the same
 * split `.github/workflows/ci.yml` already makes when it gives the db job a
 * Redis service and refuses one to the unit job.
 *
 *   PAF_TEST_REDIS_ISOLATION=none   (jest.config.ts, the unit suite)
 *
 *     Set REDIS_URL to the explicit "no Redis" value. The unit suite then opens
 *     no Redis connection at all, on any machine.
 *
 *     This is what CI already does and documents: the unit job has no Redis
 *     service, on purpose, "because the unit job's offline-queue tests exist to
 *     prove the documented degradation path -- falls back to in-memory storage
 *     when Redis is unavailable -- actually degrades." On a developer box with
 *     Memurai running, those tests silently took the *other* branch: they never
 *     exercised the fallback they were written for, and they joined the shared
 *     key space instead. Pinning the address makes every unit run take the same
 *     branch CI takes, and shrinks the suite's blast radius to its own process.
 *
 *     The cost, stated plainly: OfflineQueue's BullMQ branch loses the
 *     incidental local coverage it had on a machine that happened to run Redis.
 *     It had none in CI either way, so no CI coverage is lost -- but a proper
 *     Redis-backed OfflineQueue suite under tests/db/ is the follow-up this
 *     leaves open, and it is not written here.
 *
 *   PAF_TEST_REDIS_ISOLATION=lease  (jest.db.config.ts, the real-database suite)
 *
 *     tests/db/ must have a real Redis -- proving a BullMQ worker consumes a job
 *     is the entire point of `queue-worker.test.ts`, and it has neither fallback
 *     nor skip. So instead of removing Redis, this claims an exclusive Redis
 *     logical database for the run and rewrites REDIS_URL to it. Two concurrent
 *     `npm run test:db` invocations cannot land on the same one.
 *
 *     The claim is a lock, not a guess. A random or hashed database number would
 *     merely make collisions rarer, which is the failure this package exists to
 *     end -- a lower flake rate is still a lying instrument. `SET ... NX` either
 *     wins the database or it does not, and if all of them are genuinely held
 *     the run fails immediately with a sentence saying so, rather than
 *     corrupting someone else's queue and blaming their package.
 *
 * If Redis is unreachable, `lease` leaves REDIS_URL untouched and returns.
 * `queue-worker.test.ts` already produces the right error for that, and it says
 * more than anything this file could.
 *
 * ============================================================================
 * WHY globalSetup AND NOT setupFiles
 * ============================================================================
 *
 * The lease is a network round trip, so it has to be able to await. `setupFiles`
 * modules are required synchronously and run once per test file; `globalSetup`
 * runs once per jest run, in the parent process, and may be async. Jest forks
 * its workers after globalSetup and they inherit `process.env`, so the rewritten
 * REDIS_URL reaches every worker -- and it reaches them *before* any worker
 * requires `src/lib/queue/connection.ts`, which reads the variable at module
 * load. Under `--runInBand` (which `test:db` sets) the tests run in this same
 * process and see the mutation directly.
 *
 * A lease is never explicitly released -- see LEASE_TTL_SECONDS for why that is
 * deliberate rather than an omission. A lease whose owning process is gone is
 * reclaimed by the next run that wants it, so a crashed run cannot wedge a
 * database, and the fifteen bookkeeping keys are the whole of the residue.
 */

import IORedis from 'ioredis';

/**
 * What the unit suite is given instead of a Redis address.
 *
 * Not a closed port. Pointing at one was the first thing tried here, and it
 * still opens a socket per queue per worker, still starts an ioredis reconnect
 * loop, and still produces an asynchronous `'error'` event whose arrival time
 * nobody controls. Measured: with the fixed sleeps removed from
 * `offline-queue.test.ts` the tests finish faster than the connection fails, the
 * event lands after BullMQ has dropped its forwarding listener, and an
 * unlistened `'error'` is an uncaught exception -- 9 failures across the suite,
 * attributed to whichever test was running.
 *
 * `getRedisUrl()` returns `''` for this value, which reaches the branch
 * `OfflineQueue.getBullQueue()` already had for it: no URL, no Queue, no socket,
 * nothing left to arrive late. See src/lib/queue/connection.ts.
 */
const REDIS_DISABLED = 'disabled';

/**
 * Databases the lease may claim.
 *
 * Redis ships with 16 logical databases (0-15). Database 0 is excluded on
 * purpose: it is where a developer's own worker or a stray `npm run worker`
 * will be, and the lease FLUSHDBs what it claims.
 */
const FIRST_LEASABLE_DB = 1;
const LAST_LEASABLE_DB = 15;

/** Lease bookkeeping lives in database 0, which is never claimed or flushed. */
const LEASE_KEY_PREFIX = 'paf:test:redis-lease:';

/**
 * How long a lease key survives if nothing reclaims it first.
 *
 * There is no release step, and the absence is deliberate. The obvious place for
 * one is `process.on('exit')`, which was tried: an exit handler may not perform
 * asynchronous work, so the DEL is queued and the process is gone before it
 * reaches the socket. Measured -- three concurrent leases, all three keys still
 * present after every process had exited. A cleanup path that never runs is
 * worse than none, because the next person reads it and believes it.
 *
 * What actually recovers a lease is `pidIsAlive` below: a key whose owning
 * process no longer exists is reclaimed by the next run that wants that
 * database. That is checked on every claim, so recovery is immediate rather than
 * TTL-bound, and it does not depend on the previous run having exited politely.
 * This TTL is only the backstop for the remaining case -- the owner is gone and
 * its pid has since been recycled onto some unrelated live process. Comfortably
 * longer than a full `test:db` run, which is about three minutes here.
 */
const LEASE_TTL_SECONDS = 3600;

function connect(url: string): IORedis {
  return new IORedis(url, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
}

/** Is a pid from a lease still running? Leases are always same-machine. */
function pidIsAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    // Signal 0 performs the permission/existence check without delivering.
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means it exists and belongs to someone else -- still alive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Swap (or add) the database path segment of a Redis URL. */
function withDatabase(url: string, db: number): string {
  const parsed = new URL(url);
  parsed.pathname = `/${db}`;
  return parsed.toString();
}

/**
 * Claim a Redis logical database no other test process holds.
 * Returns the claimed number, or null if Redis could not be reached.
 * Throws if Redis is reachable but every database is held by a live process.
 */
async function leaseDatabase(baseUrl: string): Promise<number | null> {
  const client = connect(withDatabase(baseUrl, 0));

  try {
    await client.connect();
  } catch {
    // No Redis. Leave REDIS_URL alone; the suite's own precondition check will
    // say something far more useful than a lease failure would.
    client.disconnect();
    return null;
  }

  try {
    for (let db = FIRST_LEASABLE_DB; db <= LAST_LEASABLE_DB; db++) {
      const key = `${LEASE_KEY_PREFIX}${db}`;
      const owner = String(process.pid);

      let won = await client.set(key, owner, 'EX', LEASE_TTL_SECONDS, 'NX');

      if (!won) {
        // Held -- but by a process that still exists?
        const holder = Number(await client.get(key));
        if (!pidIsAlive(holder)) {
          // Reclaim, but only if nobody else got there first: delete the exact
          // value we read, then race for the key again through the same NX.
          const reclaim = await client.eval(
            'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
            1,
            key,
            String(holder)
          );
          if (reclaim === 1) {
            won = await client.set(key, owner, 'EX', LEASE_TTL_SECONDS, 'NX');
          }
        }
      }

      if (won) {
        // The database is exclusively ours for the run, so anything in it is
        // debris from a run that died -- exactly what `obliterate` was trying
        // to clear, minus the part where it cleared someone else's too.
        const owned = connect(withDatabase(baseUrl, db));
        await owned.connect();
        await owned.flushdb();
        owned.disconnect();


        return db;
      }
    }

    throw new Error(
      `P-25 Redis test isolation: every logical database from ${FIRST_LEASABLE_DB} to ` +
        `${LAST_LEASABLE_DB} on ${baseUrl} is leased by a running test process.\n` +
        'tests/db/ needs a Redis key space no other process is writing to, because ' +
        'these suites obliterate their queues to start clean and BullMQ keys are ' +
        'named from the queue name alone.\n' +
        'Wait for another `npm run test:db` to finish, or point REDIS_URL at a ' +
        'different Redis instance.'
    );
  } finally {
    client.disconnect();
  }
}

/**
 * Jest `globalSetup`. Runs once per jest run, before any worker is forked.
 */
export default async function setupRedisIsolation(): Promise<void> {
  const mode = process.env.PAF_TEST_REDIS_ISOLATION;

  if (mode === 'none') {
    process.env.REDIS_URL = REDIS_DISABLED;
    return;
  }

  if (mode !== 'lease') return;

  const baseUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
  const db = await leaseDatabase(baseUrl);
  if (db === null) return;

  process.env.REDIS_URL = withDatabase(baseUrl, db);
}

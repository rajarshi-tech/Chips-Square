/**
 * Login throttling. Five people on one club does not need Redis, but it does need *something* —
 * an unprotected password form on a public URL is a guessing game.
 *
 * This is an in-process sliding window: correct on a single instance, resets on deploy, and does not
 * coordinate across serverless instances. That is an acceptable trade for this scale; if the app is
 * ever multi-instance, move the counts into Postgres or Upstash rather than growing this file.
 */

export const WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILURES = 8;
const MAX_TRACKED_KEYS = 5_000;

const failures = new Map<string, number[]>();

/** Pure: how many attempts inside the window, given a list of attempt timestamps. */
export function countInWindow(attempts: readonly number[], now: number): number {
  return attempts.filter((at) => now - at < WINDOW_MS).length;
}

export function isThrottled(key: string, now: number = Date.now()): boolean {
  const attempts = failures.get(key);
  if (!attempts) return false;
  return countInWindow(attempts, now) >= MAX_FAILURES;
}

export function noteFailure(key: string, now: number = Date.now()): void {
  const recent = (failures.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);

  // Keep the map from growing without bound if someone sprays random emails at the form.
  if (failures.size > MAX_TRACKED_KEYS && !failures.has(key)) {
    const oldest = failures.keys().next();
    if (!oldest.done) failures.delete(oldest.value);
  }

  failures.set(key, recent);
}

export function clearFailures(key: string): void {
  failures.delete(key);
}

/** For tests only. */
export function _resetThrottle(): void {
  failures.clear();
}

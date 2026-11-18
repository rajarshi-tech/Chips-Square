import { describe, expect, it, beforeEach } from "vitest";
import {
  MAX_FAILURES,
  WINDOW_MS,
  _resetThrottle,
  clearFailures,
  countInWindow,
  isThrottled,
  noteFailure,
} from "./throttle";

const NOW = 1_700_000_000_000;

beforeEach(() => _resetThrottle());

describe("countInWindow", () => {
  it("counts only attempts inside the window", () => {
    const attempts = [NOW - WINDOW_MS - 1, NOW - 1000, NOW - 500];
    expect(countInWindow(attempts, NOW)).toBe(2);
  });

  it("is zero for an empty list", () => {
    expect(countInWindow([], NOW)).toBe(0);
  });
});

describe("throttle", () => {
  it("allows attempts up to the limit, then blocks", () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) {
      expect(isThrottled("a@b.c", NOW)).toBe(false);
      noteFailure("a@b.c", NOW);
    }
    expect(isThrottled("a@b.c", NOW)).toBe(true);
  });

  it("does not block one key because another was hammered", () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) noteFailure("noisy@b.c", NOW);
    expect(isThrottled("noisy@b.c", NOW)).toBe(true);
    expect(isThrottled("quiet@b.c", NOW)).toBe(false);
  });

  it("forgets failures older than the window", () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) noteFailure("a@b.c", NOW);
    expect(isThrottled("a@b.c", NOW + WINDOW_MS + 1)).toBe(false);
  });

  it("clears on a successful sign-in", () => {
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) noteFailure("a@b.c", NOW);
    clearFailures("a@b.c");
    expect(isThrottled("a@b.c", NOW)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { Pacer } from "../src/lib/pacer";
import { ManualClock } from "./helpers";

function setup(opts: { hidden?: boolean } = {}) {
  const clock = new ManualClock();
  const released: number[] = [];
  const pacer = new Pacer<number>((n) => released.push(n), {
    staggerMs: 300,
    minStaggerMs: 50,
    maxLagMs: 1000,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    isHidden: () => opts.hidden ?? false,
    now: clock.now,
  });
  return { clock, released, pacer };
}

describe("Pacer", () => {
  it("releases the first item at once and staggers the rest", () => {
    const { clock, released, pacer } = setup();
    pacer.push(1);
    pacer.push(2);
    pacer.push(3);
    expect(released).toEqual([1]);
    clock.advance(299);
    expect(released).toEqual([1]);
    clock.advance(1);
    expect(released).toEqual([1, 2]);
    clock.advance(300);
    expect(released).toEqual([1, 2, 3]);
  });

  it("keeps the stagger for an item pushed right after a release", () => {
    const { clock, released, pacer } = setup();
    pacer.push(1);
    clock.advance(100);
    pacer.push(2);
    expect(released).toEqual([1]);
    clock.advance(200);
    expect(released).toEqual([1, 2]);
  });

  it("drains a big backlog within maxLag (never blocks the final state)", () => {
    const { clock, released, pacer } = setup();
    for (let i = 0; i < 10; i++) pacer.push(i);
    clock.advance(1000);
    expect(released).toHaveLength(10);
    for (let i = 10; i < 40; i++) pacer.push(i);
    clock.advance(300 + 30 * 50); // bounded by max(maxLag, n × minStagger)
    expect(released).toHaveLength(40);
    expect(released).toEqual([...Array(40).keys()]);
  });

  it("immediate items flush the queue first, preserving order", () => {
    const { released, pacer } = setup();
    pacer.push(1);
    pacer.push(2);
    pacer.push(3, { immediate: true });
    expect(released).toEqual([1, 2, 3]);
    expect(pacer.pending).toBe(0);
  });

  it("does not stagger while the tab is hidden", () => {
    const { released, pacer } = setup({ hidden: true });
    pacer.push(1);
    pacer.push(2);
    expect(released).toEqual([1, 2]);
  });

  it("clear drops queued items", () => {
    const { clock, released, pacer } = setup();
    pacer.push(1);
    pacer.push(2);
    pacer.clear();
    clock.runAll();
    expect(released).toEqual([1]);
  });
});

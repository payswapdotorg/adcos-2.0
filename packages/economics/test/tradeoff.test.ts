import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { comparePriceCapacity } from "../src/contract.js";

// SYNTHETIC FIXTURES — not provider data (INVARIANTS #6). Numbers below are
// test inputs only; nothing claims a real provider price exists.

describe("comparePriceCapacity (structured trade-off evidence)", () => {
  it("computes milli-minor-units per capacity unit with floor rounding (stated rule)", () => {
    const [baseline, a] = comparePriceCapacity(
      { id: "base", priceMinorUnits: 5000, capacityUnits: 10 },
      [{ id: "a", priceMinorUnits: 12500, capacityUnits: 3 }],
    );
    assert.deepEqual(baseline, {
      candidate: "base",
      priceMinorUnits: 5000,
      capacityUnits: 10,
      pricePerCapacityMilli: 500000,
    });
    // 12500 * 1000 / 3 = 4166666.67 → floor 4166666 (rounded DOWN, stated).
    assert.equal(a.pricePerCapacityMilli, 4166666);
    assert.equal(a.candidate, "a");
  });

  it("includes the baseline first and preserves candidate order", () => {
    const result = comparePriceCapacity({ id: "base", priceMinorUnits: 100, capacityUnits: 1 }, [
      { id: "x", priceMinorUnits: 300, capacityUnits: 3 },
      { id: "y", priceMinorUnits: 0, capacityUnits: 5 },
    ]);
    assert.deepEqual(
      result.map((t) => t.candidate),
      ["base", "x", "y"],
    );
    assert.equal(result[2].pricePerCapacityMilli, 0);
  });

  it("is deterministic for a fixed input", () => {
    const baseline = { id: "base", priceMinorUnits: 5000, capacityUnits: 10 };
    const candidates = [
      { id: "x", priceMinorUnits: 300, capacityUnits: 3 },
      { id: "y", priceMinorUnits: 900, capacityUnits: 2 },
    ];
    assert.deepEqual(
      comparePriceCapacity(baseline, candidates),
      comparePriceCapacity(baseline, candidates),
    );
  });

  it("fails closed on malformed money or capacity", () => {
    assert.throws(
      () => comparePriceCapacity({ id: "b", priceMinorUnits: 12.5, capacityUnits: 1 }, []),
      /integer >= 0/,
    );
    assert.throws(
      () => comparePriceCapacity({ id: "b", priceMinorUnits: -1, capacityUnits: 1 }, []),
      /integer >= 0/,
    );
    assert.throws(
      () => comparePriceCapacity({ id: "b", priceMinorUnits: 100, capacityUnits: 0 }, []),
      /integer >= 1/,
    );
    assert.throws(
      () => comparePriceCapacity({ id: "b", priceMinorUnits: 100, capacityUnits: 1.5 }, []),
      /integer >= 1/,
    );
    assert.throws(
      () =>
        comparePriceCapacity({ id: "b", priceMinorUnits: 100, capacityUnits: 1 }, [
          { id: "c", priceMinorUnits: 100.5, capacityUnits: 2 },
        ]),
      /integer >= 0/,
    );
  });

  it("fails closed when cross products would leave the safe integer range", () => {
    assert.throws(
      () =>
        comparePriceCapacity({ id: "b", priceMinorUnits: 1, capacityUnits: 1 }, [
          {
            id: "c",
            priceMinorUnits: Number.MAX_SAFE_INTEGER,
            capacityUnits: Number.MAX_SAFE_INTEGER,
          },
        ]),
      /safe integer range/,
    );
  });
});

import { describe, test, expect } from "bun:test";
import { computeDecisionHash } from "../hash";

describe("computeDecisionHash", () => {
  const base = {
    inputs: { discount_pct: 0.1, margin_pct: 0.24 },
    output: { approved: true, autonomyLevel: 2 },
    prevHash: null,
    policyVersion: "finance-constitution@1.0.0",
  };

  test("is deterministic for the same values", () => {
    expect(computeDecisionHash(base)).toBe(computeDecisionHash(base));
  });

  test("returns a 64 character hex digest", () => {
    expect(computeDecisionHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });

  test("key order in inputs does not change the hash", () => {
    const reordered = {
      ...base,
      inputs: { margin_pct: 0.24, discount_pct: 0.1 },
    };

    expect(computeDecisionHash(reordered)).toBe(computeDecisionHash(base));
  });

  test("key order in nested objects does not change the hash", () => {
    const nested = {
      ...base,
      output: { approved: true, band: { max: 0.12, min: 0.23 } },
    };
    const nestedReordered = {
      ...base,
      output: { band: { min: 0.23, max: 0.12 }, approved: true },
    };

    expect(computeDecisionHash(nestedReordered)).toBe(
      computeDecisionHash(nested)
    );
  });

  test("array order does change the hash", () => {
    const forward = { ...base, inputs: { tags: ["a", "b"] } };
    const reversed = { ...base, inputs: { tags: ["b", "a"] } };

    expect(computeDecisionHash(reversed)).not.toBe(computeDecisionHash(forward));
  });

  test("a changed input value changes the hash", () => {
    const changed = { ...base, inputs: { ...base.inputs, discount_pct: 0.11 } };

    expect(computeDecisionHash(changed)).not.toBe(computeDecisionHash(base));
  });

  test("a changed output value changes the hash", () => {
    const changed = { ...base, output: { ...base.output, approved: false } };

    expect(computeDecisionHash(changed)).not.toBe(computeDecisionHash(base));
  });

  test("a changed prevHash changes the hash", () => {
    const changed = { ...base, prevHash: "a".repeat(64) };

    expect(computeDecisionHash(changed)).not.toBe(computeDecisionHash(base));
  });

  test("a changed policy version changes the hash", () => {
    const changed = { ...base, policyVersion: "finance-constitution@1.1.0" };

    expect(computeDecisionHash(changed)).not.toBe(computeDecisionHash(base));
  });
});

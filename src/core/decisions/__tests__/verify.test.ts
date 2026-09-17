import { describe, test, expect } from "bun:test";
import { verifyChain, type DecisionChainRecord } from "../verify";
import { computeDecisionHash } from "../../../lib/hash";

/**
 * Builds a valid chain the same way makeDecision does: each record hashes its
 * own fields plus the hash of the record before it.
 */
const buildChain = (count: number): DecisionChainRecord[] => {
  const records: DecisionChainRecord[] = [];
  let prevHash: string | null = null;

  for (let i = 0; i < count; i++) {
    const fields = {
      inputs: { discount_pct: 0.01 * i, margin_pct: 0.3 },
      output: { approved: true, autonomyLevel: 2 },
      prevHash,
      policyVersion: "finance-constitution@1.0.0",
    };
    const hash = computeDecisionHash(fields);

    records.push({ id: `decision-${i}`, hash, ...fields });
    prevHash = hash;
  }

  return records;
};

describe("verifyChain", () => {
  test("an empty chain verifies", () => {
    expect(verifyChain([])).toEqual({ ok: true });
  });

  test("a single genesis record verifies", () => {
    expect(verifyChain(buildChain(1))).toEqual({ ok: true });
  });

  test("a valid three record chain verifies", () => {
    expect(verifyChain(buildChain(3))).toEqual({ ok: true });
  });

  test("a first record with a non-null prevHash is a link break", () => {
    const chain = buildChain(1);
    chain[0]!.prevHash = "b".repeat(64);

    expect(verifyChain(chain)).toEqual({
      ok: false,
      index: 0,
      id: "decision-0",
      breakType: "link",
    });
  });

  test("a tampered input is caught as a content break at its own index", () => {
    const chain = buildChain(3);
    chain[1]!.inputs = { discount_pct: 0.99, margin_pct: 0.3 };

    expect(verifyChain(chain)).toEqual({
      ok: false,
      index: 1,
      id: "decision-1",
      breakType: "content",
    });
  });

  test("a tampered output is caught as a content break", () => {
    const chain = buildChain(3);
    chain[2]!.output = { approved: false, autonomyLevel: 0 };

    expect(verifyChain(chain)).toEqual({
      ok: false,
      index: 2,
      id: "decision-2",
      breakType: "content",
    });
  });

  test("a tampered policy version is caught as a content break", () => {
    const chain = buildChain(2);
    chain[1]!.policyVersion = "finance-constitution@9.9.9";

    expect(verifyChain(chain)).toEqual({
      ok: false,
      index: 1,
      id: "decision-1",
      breakType: "content",
    });
  });

  test("a removed middle record is caught as a link break", () => {
    const chain = buildChain(3);
    const withoutMiddle = [chain[0]!, chain[2]!];

    expect(verifyChain(withoutMiddle)).toEqual({
      ok: false,
      index: 1,
      id: "decision-2",
      breakType: "link",
    });
  });

  test("reordered records are caught as a link break", () => {
    const chain = buildChain(3);
    const reordered = [chain[0]!, chain[2]!, chain[1]!];

    expect(verifyChain(reordered)).toEqual({
      ok: false,
      index: 1,
      id: "decision-2",
      breakType: "link",
    });
  });

  test("reports only the first break when several records are broken", () => {
    const chain = buildChain(4);
    chain[1]!.inputs = { tampered: true };
    chain[3]!.inputs = { tampered: true };

    expect(verifyChain(chain)).toEqual({
      ok: false,
      index: 1,
      id: "decision-1",
      breakType: "content",
    });
  });
});

import {
  computeDecisionHash,
  type ComputeDecisionHashOptions,
} from "../../lib/hash";

/**
 * A stored decision, reduced to what the chain proof needs: the hash fields
 * themselves plus the identity and the hash that was persisted alongside them.
 */
interface DecisionChainRecord extends ComputeDecisionHashOptions {
  id: string;
  hash: string;
}

type ChainVerificationResult =
  | { ok: true }
  | {
      ok: false;
      /** Position of the first broken record in the supplied order. */
      index: number;
      id: string;
      /**
       * `content`: the record's own fields no longer hash to its stored hash.
       * `link`: the record's prevHash does not point at the record before it.
       */
      breakType: "content" | "link";
    };

/**
 * Recomputes every decision hash and checks every prevHash link.
 *
 * Pure: no database access. Callers pass rows already in chain order, oldest
 * first. An empty chain verifies, and the first record must carry a null
 * prevHash to count as the genesis record.
 */
const verifyChain = (
  records: DecisionChainRecord[]
): ChainVerificationResult => {
  let expectedPrevHash: string | null = null;

  for (let index = 0; index < records.length; index++) {
    const record = records[index]!;

    if (record.prevHash !== expectedPrevHash) {
      return { ok: false, index, id: record.id, breakType: "link" };
    }

    if (computeDecisionHash(record) !== record.hash) {
      return { ok: false, index, id: record.id, breakType: "content" };
    }

    expectedPrevHash = record.hash;
  }

  return { ok: true };
};

export { verifyChain, type DecisionChainRecord, type ChainVerificationResult };

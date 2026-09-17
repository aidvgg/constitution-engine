import type { DecisionMemory } from "./types";

const similar = async (
  _node: string,
  _contextVec: number[],
  _limit: number
): Promise<DecisionMemory[]> => {
  // TODO: Implement pgvector k-NN search
  // Will use: ORDER BY context_vec <-> $1::vector
  // to find similar decisions by cosine distance
  return [];
};

export { similar };

import { createHash } from "crypto";

const sortKeys = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sortKeys);
  }

  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeys(obj[key]);
  }

  return sorted;
};

/**
 * The exact field list that goes into a decision hash. Decision creation and
 * chain verification both hash through this shape, so the two cannot drift.
 */
interface ComputeDecisionHashOptions {
  inputs: Record<string, any>;
  output: Record<string, any>;
  prevHash: string | null;
  policyVersion: string;
}

const computeDecisionHash = (params: ComputeDecisionHashOptions): string => {
  const { inputs, output, prevHash, policyVersion } = params;

  const stableInputs = JSON.stringify(sortKeys(inputs));
  const stableOutput = JSON.stringify(sortKeys(output));

  const hashInput = `${stableInputs}|${stableOutput}|${
    prevHash || ""
  }|${policyVersion}`;

  return createHash("sha256").update(hashInput).digest("hex");
};

export { computeDecisionHash, type ComputeDecisionHashOptions };

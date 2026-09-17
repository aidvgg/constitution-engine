import { type Request } from "express";
import PolicyLoader from "../policy/loader";
import { evaluate } from "../policy/evaluator";
import { db } from "../../db";
import { decisions } from "../../db/schema";
import { desc } from "drizzle-orm";
import { computeDecisionHash } from "../../lib/hash";
import { BadRequestError } from "../../errors/bad-request-error";
import { NotFoundError } from "../../errors/not-found-error";

interface MakeDecisionOutput {
  id: string;
  approved: boolean;
  autonomyLevel: number;
  reason: string;
  hash: string;
  prevHash: string | null;
  policyVersion: string;
  latencyMs: number;
  escalationTarget?: string;
  correlationId: string;
  ts: Date;
}

interface MakeDecisionParams {
  node: string;
  action: string;
  data: Record<string, any>;
  correlationId: string;
  policyVersion?: string;
  req: Request;
}

const makeDecision = async (
  params: MakeDecisionParams
): Promise<MakeDecisionOutput> => {
  const {
    node,
    action,
    data,
    correlationId,
    policyVersion,
  } = params;

  const startTime = performance.now();

  const policyName = policyVersion ?? `${node}-constitution`;

  const policy = await PolicyLoader.load(policyName);

  const policyNode = policy.doc.nodes[node];
  if (!policyNode) {
    throw new NotFoundError(`Node '${node}' not found in policy ${policyName}`);
  }

  const authority = policyNode.authorities.find((a) => a.action === action);
  if (!authority) {
    throw new BadRequestError(
      `Action '${action}' not found in node '${node}' of policy ${policyName}`
    );
  }

  const evaluationResult = evaluate({ action, data }, authority);

  const previousDecision = await db.query.decisions.findFirst({
    orderBy: [desc(decisions.ts)],
    columns: { hash: true },
  });

  const prevHash = previousDecision?.hash ?? null;

  const output = {
    approved: evaluationResult.approved,
    autonomyLevel: evaluationResult.autonomyLevel,
    reason: evaluationResult.reason,
    ...(evaluationResult.escalationTarget && {
      escalationTarget: evaluationResult.escalationTarget,
    }),
    ...(evaluationResult.matchedBand && {
      matchedBand: evaluationResult.matchedBand,
    }),
  };

  const hash = computeDecisionHash({
    inputs: data,
    output,
    prevHash,
    policyVersion: `${policy.name}@${policy.version}`,
  });

  const latencyMs = Math.round(performance.now() - startTime);

  const [insertedDecision] = await db
    .insert(decisions)
    .values({
      node,
      policyVersion: `${policy.name}@${policy.version}`,
      inputs: data,
      output,
      autonomyLevel: evaluationResult.autonomyLevel,
      hash,
      prevHash,
      correlationId,
      latencyMs,
    })
    .returning();

  return {
    id: insertedDecision!.id,
    approved: evaluationResult.approved,
    autonomyLevel: evaluationResult.autonomyLevel,
    reason: evaluationResult.reason,
    hash: insertedDecision!.hash,
    prevHash: insertedDecision!.prevHash,
    policyVersion: insertedDecision!.policyVersion,
    latencyMs: insertedDecision!.latencyMs!,
    escalationTarget: evaluationResult.escalationTarget,
    correlationId: insertedDecision!.correlationId,
    ts: insertedDecision!.ts,
  };
};

export { makeDecision };

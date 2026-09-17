import { asyncHandler } from "../middleware/async-handler";
import { Router, type Response } from "express";
import {
  validateRequest,
  type ValidatedRequest,
} from "../middleware/validate-request";
import {
  createDecisionSchema,
  decisionParamsSchema,
  type CreateDecisionDto,
} from "./schemas";
import { makeDecision } from "../core/decisions/decisions";
import { verifyChain, type DecisionChainRecord } from "../core/decisions/verify";
import { db } from "../db";
import { decisions } from "../db/schema";
import { asc } from "drizzle-orm";

const router = Router();

/**
 * GET /decisions/verify
 *
 * Read-only chain proof. Loads every decision oldest first and recomputes each
 * hash through the same builder that created it. `ts` alone is ambiguous when
 * two decisions share a timestamp, so `id` breaks the tie for a stable order.
 */
router.get(
  "/decisions/verify",
  asyncHandler(async (req: ValidatedRequest<any, any, any>, res: Response) => {
    const records = await db.query.decisions.findMany({
      orderBy: [asc(decisions.ts), asc(decisions.id)],
      columns: {
        id: true,
        inputs: true,
        output: true,
        prevHash: true,
        policyVersion: true,
        hash: true,
      },
    });

    const result = verifyChain(records as DecisionChainRecord[]);

    req.log.info(
      { chainOk: result.ok, count: records.length },
      "Decision chain verified"
    );

    res.status(200).json({
      success: true,
      data: { ...result, count: records.length },
    });
  })
);

router.post(
  "/decisions/:node",
  validateRequest({ body: createDecisionSchema, params: decisionParamsSchema }),
  asyncHandler(
    async (
      req: ValidatedRequest<{ node: string }, any, CreateDecisionDto>,
      res: Response
    ) => {
      const { node: nodeParam } = req.validated.params;
      const { action, data, correlationId, policyVersion } = req.validated.body;

      const finalCorrelationId = correlationId ?? req.id;

      const decision = await makeDecision({
        node: nodeParam,
        action,
        data,
        correlationId: finalCorrelationId,
        policyVersion,
        req,
      });

      req.log.info(
        {
          decisionId: decision.id,
          node: nodeParam,
          action,
          approved: decision.approved,
          autonomyLevel: decision.autonomyLevel,
          latencyMs: decision.latencyMs,
        },
        "Decision created"
      );

      res.status(201).json({
        success: true,
        data: decision,
      });
    }
  )
);

export { router as decisionsRouter };

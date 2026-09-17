import { Router } from "express";

const router = Router();

router.get("/metrics", (_req, res) => {
  // p50Latency, p95Latency and errorCount are static placeholders, not measured metrics.
  res.status(200).json({
    ok: true,
    placeholder: true,
    p50Latency: 100,
    p95Latency: 200,
    errorCount: 0,
  });
});

export { router as metricsRouter };

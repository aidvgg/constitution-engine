import { Router } from "express";

const router = Router();

router.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    correlationId: req.id,
  });
});

export { router as healthRouter };

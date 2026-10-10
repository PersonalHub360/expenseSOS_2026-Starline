import { Router, type Response } from "express";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import { listAudit, parseAuditRange } from "./queries";

export const auditRouter = Router();

auditRouter.use(requireAuth);

auditRouter.get("/", requirePermission("reports", "view"), async (req, res) => {
  const parsed = parseAuditRange(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json({ entries: await listAudit(parsed.value.from, parsed.value.to) });
});

export function actorId(res: Response) {
  return (res.locals.principal as Principal | undefined)?.id ?? null;
}

import { Router, type Response } from "express";
import { requireAuth, requirePermission, type Principal } from "../auth/principal";
import { dashboardReport, listNotifications } from "./queries";
import { parseDashboardRange } from "./validate";

export const dashboardRouter = Router();

dashboardRouter.use(requireAuth);

dashboardRouter.get("/", requirePermission("dashboard", "view"), async (req, res) => {
  const parsed = parseDashboardRange(req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  res.json(await dashboardReport(parsed.value, principal(res)));
});

dashboardRouter.get("/notifications", requirePermission("dashboard", "view"), async (_req, res) => {
  res.json({ notifications: await listNotifications(principal(res)) });
});

function principal(res: Response) {
  return res.locals.principal as Principal;
}

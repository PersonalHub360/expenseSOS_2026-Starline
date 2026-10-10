import { Router } from "express";
import { requireAuth, requirePermission } from "../auth/principal";
import { reportCsv, reportPdf, reportSheet } from "./export";
import { buildReport, reportCatalog } from "./queries";
import { parseReportRequest } from "./validate";

export const reportsRouter = Router();

reportsRouter.use(requireAuth);

reportsRouter.get("/catalog", requirePermission("reports", "view"), async (_req, res) => {
  res.json(await reportCatalog());
});

reportsRouter.get("/:kind", requirePermission("reports", "view"), async (req, res) => {
  const kind = Array.isArray(req.params.kind) ? req.params.kind[0] : req.params.kind;
  const parsed = parseReportRequest(kind ?? "", req.query as Record<string, unknown>);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const report = await buildReport(parsed.value.kind, parsed.value.filters);
  if (parsed.value.filters.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${parsed.value.kind}.csv"`);
    res.send(reportCsv(report));
    return;
  }
  if (parsed.value.filters.format === "xls") {
    res.setHeader("Content-Type", "application/vnd.ms-excel; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${parsed.value.kind}.xls"`);
    res.send(reportSheet(report));
    return;
  }
  if (parsed.value.filters.format === "pdf") {
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${parsed.value.kind}.pdf"`);
    res.send(reportPdf(report));
    return;
  }
  res.json({ report });
});

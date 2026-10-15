import connectPgSimple from "connect-pg-simple";
import express from "express";
import session from "express-session";
import helmet from "helmet";
import { env } from "./env";
import { authRouter } from "./auth/routes";
import { projectsRouter } from "./projects/routes";
import { expensesRouter, vendorsRouter } from "./expenses/routes";
import { auditRouter } from "./audit/routes";
import { dashboardRouter } from "./dashboard/routes";
import { filesRouter } from "./files/routes";
import { reportsRouter } from "./reports/routes";
import { accountsRouter, employeesRouter, investmentsRouter, investorsRouter } from "./finance/routes";
import { usersRouter } from "./users/routes";
import { bookingsRouter, buyersRouter, paymentsRouter, refundsRouter, salesRouter } from "./sales/routes";
import { pool } from "./db/client";

const PgSession = connectPgSimple(session);

function originAllowed(origin: string) {
  if (origin === env.APP_ORIGIN) return true;
  if (env.NODE_ENV !== "development") return false;
  try {
    const expected = new URL(env.APP_ORIGIN);
    const actual = new URL(origin);
    const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]);
    return (
      actual.protocol === expected.protocol &&
      actual.port === expected.port &&
      loopback.has(actual.hostname) &&
      loopback.has(expected.hostname)
    );
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();
  app.set("trust proxy", env.NODE_ENV === "production");
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: false,
      strictTransportSecurity: env.NODE_ENV === "production",
    }),
  );
  const smallJson = express.json({ limit: "20kb" });
  const receiptJson = express.json({ limit: "2mb" });
  app.use((req, res, next) => {
    if (
      req.method === "POST" &&
      (req.path === "/api/files" || req.path === "/api/expenses/import" || /\/api\/expenses\/[^/]+\/receipt$/.test(req.path))
    ) {
      receiptJson(req, res, next);
      return;
    }
    smallJson(req, res, next);
  });

  app.use((req, res, next) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
      next();
      return;
    }
    const origin = req.get("origin");
    if (origin && !originAllowed(origin)) {
      res.status(403).json({ error: "Cross-origin request blocked" });
      return;
    }
    const contentType = req.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      res.status(415).json({ error: "Expected application/json" });
      return;
    }
    next();
  });

  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: "session",
        createTableIfMissing: false,
      }),
      name: "starline.sid",
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        path: "/",
        maxAge: 1000 * 60 * 60 * 8,
      },
    }),
  );

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/projects", projectsRouter);
  app.use("/api/buyers", buyersRouter);
  app.use("/api/bookings", bookingsRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/payments", paymentsRouter);
  app.use("/api/refunds", refundsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/vendors", vendorsRouter);
  app.use("/api/investments", investmentsRouter);
  app.use("/api/investors", investorsRouter);
  app.use("/api/accounts", accountsRouter);
  app.use("/api/employees", employeesRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/audit", auditRouter);
  app.use("/api/users", usersRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(error instanceof Error ? error.message : "Request failed");
    if (res.headersSent) return;
    res.status(500).json({ error: "Something went wrong." });
  });

  return app;
}

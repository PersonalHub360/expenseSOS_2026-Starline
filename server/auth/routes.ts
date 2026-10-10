import { eq, or } from "drizzle-orm";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { db } from "../db/client";
import { users } from "../db/schema";
import { dummyPasswordCheck, verifyPassword } from "./password";
import { findPrincipal, requireAuth, requirePermission } from "./principal";

const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(200),
  password: z.string().min(1).max(200),
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Too many login attempts. Try again later." },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your username and password." });
    return;
  }

  const { identifier, password } = parsed.data;
  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash, isActive: users.isActive })
    .from(users)
    .where(or(eq(users.username, identifier), eq(users.email, identifier)))
    .limit(1);

  const valid = user ? await verifyPassword(password, user.passwordHash) : false;
  if (!user || !valid) {
    if (!user) await dummyPasswordCheck(password);
    res.status(401).json({ error: "Those credentials are not valid." });
    return;
  }
  if (!user.isActive) {
    res.status(401).json({ error: "Those credentials are not valid." });
    return;
  }

  req.session.regenerate((error) => {
    if (error) {
      res.status(500).json({ error: "Could not start a session." });
      return;
    }
    req.session.userId = user.id;
    req.session.save(async (saveError) => {
      if (saveError) {
        res.status(500).json({ error: "Could not start a session." });
        return;
      }
      const principal = await findPrincipal(user.id);
      res.json({ user: principal });
    });
  });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      res.status(500).json({ error: "Could not end the session." });
      return;
    }
    res.clearCookie("starline.sid", { httpOnly: true, sameSite: "lax", path: "/" });
    res.json({ ok: true });
  });
});

authRouter.get("/me", async (req, res) => {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const principal = await findPrincipal(req.session.userId);
  if (!principal) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  res.json({ user: principal });
});

authRouter.get("/users", requireAuth, requirePermission("users", "view"), async (_req, res) => {
  const rows = await db
    .select({ id: users.id, email: users.email, username: users.username, isActive: users.isActive })
    .from(users);
  res.json({ users: rows });
});

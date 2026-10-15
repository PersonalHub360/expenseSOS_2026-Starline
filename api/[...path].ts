import type { Express, Request, Response } from "express";

let starting: Promise<Express> | undefined;

function apiUrl(url: string | undefined) {
  const path = url && url.startsWith("/") ? url : `/${url ?? ""}`;
  if (path === "/api" || path.startsWith("/api/") || path.startsWith("/api?")) return path;
  return `/api${path}`;
}

function getApp() {
  starting ??= import("../server/app").then(({ createApp }) => createApp());
  return starting;
}

export default async function handler(req: Request, res: Response) {
  req.url = apiUrl(req.url);
  try {
    const app = await getApp();
    app(req, res);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "API failed to start");
    if (!res.headersSent) {
      res.status(500).json({ error: "Sign-in is not ready. Add the database settings on the host." });
    }
  }
}

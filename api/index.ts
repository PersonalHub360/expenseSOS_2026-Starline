import type { Express, Request, Response } from "express";

let starting: Promise<Express> | undefined;

function apiUrl(url: string | undefined) {
  const [path, query] = (url && url.startsWith("/") ? url : `/${url ?? ""}`).split("?");
  const withApi = path === "/api" || path.startsWith("/api/") ? path : `/api${path}`;
  return query ? `${withApi}?${query}` : withApi;
}

function header(req: Request, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function requestPath(req: Request) {
  const candidates = [req.url, header(req, "x-forwarded-uri"), header(req, "x-original-url"), header(req, "x-invoke-path"), header(req, "x-matched-path")];
  const detailed = candidates.find((value) => value?.includes("/api/") && !value.startsWith("/api?"));
  return apiUrl(detailed ?? req.url);
}

function getApp() {
  starting ??= import("../server/app").then(({ createApp }) => createApp());
  return starting;
}

export default async function handler(req: Request, res: Response) {
  try {
    req.url = requestPath(req);
    const app = await getApp();
    app(req, res);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "API failed to start");
    if (!res.headersSent) {
      res.status(500).json({ error: "Sign-in is not ready. Add the database settings on the host." });
    }
  }
}

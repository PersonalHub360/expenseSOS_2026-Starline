import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  APP_ORIGIN: z.string().url(),
  PORT: z.coerce.number().int().positive().default(4000),
  DEMO_ADMIN_EMAIL: z.string().email().optional(),
  DEMO_ADMIN_USERNAME: z.string().min(3).optional(),
  DEMO_ADMIN_PASSWORD: z.string().min(12).optional(),
});

type Env = z.infer<typeof schema>;

function readEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (parsed.success) return parsed.data;
  const fields = parsed.error.issues.map((issue) => issue.path.join(".") || "environment").join(", ");
  const message = `Invalid environment configuration: ${fields}`;
  if (process.env.VERCEL) throw new Error(message);
  console.error(message);
  process.exit(1);
}

let loaded: Env | undefined;

export const env: Env = new Proxy({} as Env, {
  get(_target, property) {
    loaded ??= readEnv();
    return loaded[property as keyof Env];
  },
});

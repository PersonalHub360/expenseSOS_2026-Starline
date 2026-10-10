import { z } from "zod";
import { fileSubjects } from "./access";

export function parseFileUpload(body: unknown) {
  const parsed = z
    .object({
      subjectType: z.enum(fileSubjects),
      subjectId: z.string().uuid(),
      title: z.string().trim().min(1, "Enter a document title.").max(120),
      fileName: z.string().trim().min(1).max(180),
      contentType: z.string().trim().min(1).max(80),
      data: z.string().min(1),
    })
    .safeParse(body);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Check the document." };
  return { ok: true as const, value: parsed.data };
}

export function parseFileList(query: Record<string, unknown>) {
  const parsed = z
    .object({
      subjectType: z.enum(fileSubjects),
      subjectId: z.string().uuid(),
    })
    .safeParse({
      subjectType: typeof query.subjectType === "string" ? query.subjectType : "",
      subjectId: typeof query.subjectId === "string" ? query.subjectId : "",
    });
  if (!parsed.success) return { ok: false as const, error: "Choose a buyer, project, sale, expense, or investment." };
  return { ok: true as const, value: parsed.data };
}

import { useEffect, useRef, useState } from "react";
import { FileText, ImagePlus, Paperclip, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTimestamp } from "@/lib/sales";

type RecordFile = {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  createdAt: string;
};

type QueuedFile = {
  id: string;
  file: File;
  label?: string;
  preview: string | null;
};

const maxBytes = 1_500_000;

export function RecordFiles({
  subjectType,
  subjectId,
  module,
}: {
  subjectType: "buyer" | "project" | "sale" | "expense" | "investment";
  subjectId: string;
  module: "buyers" | "projects" | "sales" | "expenses" | "investments";
}) {
  const { user } = useAuth();
  const [files, setFiles] = useState<RecordFile[] | null>(null);
  const [queued, setQueued] = useState<QueuedFile[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const canEdit = can(user, module, "edit");
  const canDelete = can(user, module, "delete");

  function load() {
    api<{ files: RecordFile[] }>(`/api/files?subjectType=${subjectType}&subjectId=${subjectId}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setFiles(result.data.files);
      }
    });
  }

  useEffect(() => {
    if (!subjectId || !can(user, module, "view")) return;
    load();
  }, [subjectId, subjectType, module, user]);

  function queue(list: FileList | null, label?: string) {
    if (!list || list.length === 0) return;
    const next = [...list].map((file) => ({
      id: crypto.randomUUID(),
      file,
      label,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setQueued((current) => [...current, ...next]);
    setError("");
  }

  function unqueue(id: string) {
    setQueued((current) => {
      const item = current.find((entry) => entry.id === id);
      if (item?.preview) URL.revokeObjectURL(item.preview);
      return current.filter((entry) => entry.id !== id);
    });
  }

  async function uploadAll() {
    if (queued.length === 0 || busy) return;
    setBusy(true);
    const problems: string[] = [];
    for (const item of queued) {
      if (item.file.size > maxBytes) {
        problems.push(`${item.file.name} is larger than 1.5 MB.`);
        continue;
      }
      const bytes = new Uint8Array(await item.file.arrayBuffer());
      let binary = "";
      for (let index = 0; index < bytes.length; index += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
      }
      const result = await api(`/api/files`, {
        method: "POST",
        body: JSON.stringify({
          subjectType,
          subjectId,
          title: queued.length === 1 && title.trim() ? title.trim() : item.label ? `${item.label} · ${item.file.name}` : item.file.name,
          fileName: item.file.name,
          contentType: contentTypeOf(item.file),
          data: btoa(binary),
        }),
      });
      if (!result.ok) problems.push(`${item.file.name}: ${result.error}`);
    }
    for (const item of queued) {
      if (item.preview) URL.revokeObjectURL(item.preview);
    }
    setQueued([]);
    setTitle("");
    if (imageInput.current) imageInput.current.value = "";
    if (fileInput.current) fileInput.current.value = "";
    setError(problems.join(" "));
    setBusy(false);
    load();
  }

  async function remove(id: string) {
    const result = await api(`/api/files/${id}`, { method: "DELETE", body: JSON.stringify({}) });
    if (!result.ok) setError(result.error);
    else load();
  }

  if (!can(user, module, "view")) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-[24px] border border-[#efe7f5] bg-white shadow-[0_12px_32px_rgba(124,58,237,0.06)]">
      <div className="flex items-center justify-between bg-gradient-to-r from-[#0f766e] via-[#2563eb] to-[#7c3aed] px-5 py-4 text-white">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Attachments</p>
          <h2 className="text-lg font-semibold">Slips, images, and files</h2>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{files?.length ?? 0} saved</span>
      </div>
      <div className="p-4 sm:p-5">
        {error ? <p className="mb-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
        {!files ? <p className="text-sm text-[#7d8b96]">Loading documents…</p> : null}
        {files && files.length === 0 ? <p className="text-sm text-[#7d8b96]">No images or files attached yet.</p> : null}
        {files && files.length > 0 ? (
          <ul className="grid gap-2">
            {files.map((file) => {
              const image = file.contentType.startsWith("image/");
              return (
                <li key={file.id} className="flex items-center gap-3 rounded-2xl border border-[#e7eef2] bg-[#f8fafc] p-3">
                  {image ? (
                    <a href={`/api/files/${file.id}`} className="shrink-0">
                      <img src={`/api/files/${file.id}?inline=1`} alt="" className="h-14 w-14 rounded-xl object-cover" />
                    </a>
                  ) : (
                    <a href={`/api/files/${file.id}`} className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-[#fff1f2] text-[#be123c]">
                      <FileText className="h-5 w-5" aria-hidden="true" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <a className="block truncate font-semibold text-[#16302c] hover:text-[#be123c]" href={`/api/files/${file.id}`}>
                      {file.title}
                    </a>
                    <p className="truncate text-xs text-[#7d8b96]">{file.fileName}</p>
                    <p className="text-xs text-[#94a3b8]">{formatTimestamp(file.createdAt)}</p>
                  </div>
                  {canDelete ? (
                    <button type="button" className="shrink-0 rounded-xl px-3 py-2 text-xs font-semibold text-[#b42318] hover:bg-[#fff1f2]" onClick={() => void remove(file.id)}>
                      Remove
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
        {canEdit ? (
          <div className="mt-4 rounded-2xl border border-[#e7eef2] bg-[#f8fafc] p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="block min-w-0 flex-1 text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-[#64748b]">Title for one file</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="h-11 w-full rounded-xl border border-[#e4eaee] bg-white px-3"
                  placeholder="Optional — each file keeps its own name"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#be123c] px-3 text-sm font-semibold text-white">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Add slips
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      queue(event.target.files, "Slip");
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#7c3aed] px-3 text-sm font-semibold text-white">
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                  Add images
                  <input
                    ref={imageInput}
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      queue(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-[#0f766e] px-3 text-sm font-semibold text-white">
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  Add files
                  <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept="application/pdf"
                    className="sr-only"
                    onChange={(event) => {
                      queue(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
              </div>
            </div>
            <p className="mt-2 text-xs text-[#7d8b96]">Add several slips, images, or PDF files at once. Each file up to 1.5 MB.</p>
            {queued.length > 0 ? (
              <>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {queued.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 rounded-xl bg-white px-2 py-2">
                      {item.preview ? (
                        <img src={item.preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
                      ) : (
                        <span className="grid h-12 w-12 place-items-center rounded-lg bg-[#fff1f2] text-[#9f1239]">
                          <FileText className="h-5 w-5" aria-hidden="true" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm">{item.file.name}</span>
                      <button type="button" className="rounded-lg p-1 text-[#64748b]" aria-label={`Remove ${item.file.name}`} onClick={() => unqueue(item.id)}>
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <Button className="mt-3" type="button" disabled={busy} onClick={() => void uploadAll()}>
                  {busy ? "Attaching…" : `Attach ${queued.length}`}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function contentTypeOf(file: File) {
  if (file.type === "image/jpeg" || file.type === "image/png" || file.type === "image/webp" || file.type === "application/pdf") {
    return file.type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return file.type || "application/octet-stream";
}

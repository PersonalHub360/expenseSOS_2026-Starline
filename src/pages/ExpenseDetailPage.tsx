import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { RecordFiles } from "@/components/files/RecordFiles";
import { OperationStatus } from "@/components/operations/OperationStatus";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { formatTimestamp, frequencyLabels, methodLabel, type ExpenseDetail } from "@/lib/operations";

const maxReceiptBytes = 1_500_000;

export function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [expense, setExpense] = useState<ExpenseDetail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const id = params.id ?? "";

  function load() {
    api<{ expense: ExpenseDetail }>(`/api/expenses/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setExpense(result.data.expense);
      }
    });
  }

  useEffect(() => {
    if (!id || !can(user, "expenses", "view")) return;
    load();
  }, [id, user]);

  if (!can(user, "expenses", "view")) return <p className="text-sm text-[#b42318]">You do not have access to expenses.</p>;

  async function decide(path: string, decision: "approved" | "rejected") {
    const result = await api(`/api/expenses/${id}/${path}`, {
      method: "POST",
      body: JSON.stringify({ decision, note: "" }),
    });
    if (!result.ok) setError(result.error);
    else {
      setNotice(decision === "approved" ? "Decision saved." : "Request rejected.");
      load();
    }
  }

  async function upload(file: File) {
    if (file.size > maxReceiptBytes) {
      setError("Receipts must be 1.5 MB or smaller.");
      return;
    }
    const data = await file.arrayBuffer();
    const bytes = new Uint8Array(data);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const result = await api(`/api/expenses/${id}/receipt`, {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, contentType: file.type, data: btoa(binary) }),
    });
    if (!result.ok) setError(result.error);
    else {
      setNotice("Receipt attached.");
      load();
    }
  }

  const ownRequest = Boolean(user && expense?.approvalRequestedBy === user.id);
  const canEdit = can(user, "expenses", "edit");

  return (
    <div>
      <Link href="/expenses" className="text-sm font-semibold text-[#12786c]">
        All expenses
      </Link>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {!expense ? (
        <p className="mt-4 text-sm text-[#7d8b96]">Loading expense…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{expense.category}</h1>
            <OperationStatus value={expense.status} />
          </div>
          <p className="mt-1 text-sm text-[#5c6b76]">
            {formatTimestamp(expense.spentAt)} · {methodLabel(expense.method)}
            {expense.project ? ` · ${expense.project.name}` : ""}
            {expense.account ? ` · Paid from ${expense.account.name}` : ""}
          </p>
          <p className="mt-4 text-3xl font-semibold">{formatTaka(expense.amount)}</p>
          {expense.description ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5c6b76]">{expense.description}</p> : null}
          {expense.frequency && expense.nextDueDate ? (
            <p className="mt-2 text-sm text-[#5c6b76]">
              {frequencyLabels[expense.frequency]} · next due {expense.nextDueDate}
            </p>
          ) : null}
          {expense.decisionNote ? <p className="mt-2 text-sm text-[#5c6b76]">{expense.decisionNote}</p> : null}

          <div className="mt-5 flex flex-wrap gap-2">
            {expense.status === "pending" && canEdit && !ownRequest ? (
              <>
                <Button onClick={() => decide("decision", "approved")}>Approve</Button>
                <Button variant="secondary" onClick={() => decide("decision", "rejected")}>
                  Reject
                </Button>
              </>
            ) : null}
            {expense.status === "pending" && ownRequest ? (
              <p className="text-sm text-[#8a6230]">Someone else with approval access has to accept this expense.</p>
            ) : null}
            {expense.status === "void_pending" && canEdit && !ownRequest ? (
              <>
                <Button onClick={() => decide("void-decision", "approved")}>Approve void</Button>
                <Button variant="secondary" onClick={() => decide("void-decision", "rejected")}>
                  Keep expense
                </Button>
              </>
            ) : null}
            {expense.status === "approved" && canEdit ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await api(`/api/expenses/${id}/void`, { method: "POST", body: JSON.stringify({ note: "" }) });
                  if (!result.ok) setError(result.error);
                  else {
                    setNotice("Void requested. It still counts until someone else approves it.");
                    load();
                  }
                }}
              >
                Request void
              </Button>
            ) : null}
            {expense.status === "approved" && expense.frequency && can(user, "expenses", "add") ? (
              <Button
                variant="secondary"
                onClick={async () => {
                  const result = await api(`/api/expenses/${id}/next`, { method: "POST", body: "{}" });
                  if (!result.ok) setError(result.error);
                  else {
                    setNotice("Next occurrence posted.");
                    load();
                  }
                }}
              >
                Post next due
              </Button>
            ) : null}
          </div>

          <section className="mt-6 rounded-[22px] border border-[#eef1f4] bg-white p-4">
            <h2 className="font-semibold">Receipt</h2>
            {expense.hasReceipt ? (
              <a className="mt-2 inline-block text-sm font-semibold text-[#12786c] hover:underline" href={`/api/expenses/${id}/receipt`}>
                Download {expense.description || "receipt"}
              </a>
            ) : (
              <p className="mt-2 text-sm text-[#7d8b96]">No receipt attached.</p>
            )}
            {canEdit && expense.status !== "void" && expense.status !== "rejected" ? (
              <label className="mt-3 inline-block text-sm font-semibold text-[#12786c]">
                Upload PDF, JPEG, PNG, or WebP
                <input
                  className="mt-1 block text-sm font-normal text-[#5c6b76]"
                  type="file"
                  accept="application/pdf,image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void upload(file);
                  }}
                />
              </label>
            ) : null}
          </section>
          <RecordFiles subjectType="expense" subjectId={id} module="expenses" />
        </>
      )}
    </div>
  );
}

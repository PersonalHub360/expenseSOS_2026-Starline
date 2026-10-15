import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { CreateSlipForm } from "@/components/sales/CreateSlipForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { addMoney, formatTaka, subtractMoney } from "@/lib/money";
import { loadManualSlips, type ManualSlip } from "@/lib/manualSlip";
import { formatTimestamp, methodLabel } from "@/lib/sales";
import { cn } from "@/lib/utils";

type PaymentRow = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  note: string;
  paidAt: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  reference: string;
  projectName: string;
  unitNumber: string;
};

type RefundRow = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  note: string;
  refundedAt: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  bookingReference: string;
  projectName: string;
  unitNumber: string;
};

type RegisterLine = {
  id: string;
  href: string;
  receiptNumber: string;
  kind: "Payment" | "Refund";
  amount: string;
  method: string;
  note: string;
  buyerId: string | null;
  buyerName: string;
  buyerPhone: string;
  reference: string;
  projectName: string;
  unitNumber: string;
  at: string;
};

const methodTones: Record<string, string> = {
  cash: "bg-[#d1fae5] text-[#065f46]",
  bank: "bg-[#dbeafe] text-[#1e3a8a]",
  bkash: "bg-[#fce7f3] text-[#9d174d]",
  nagad: "bg-[#ffedd5] text-[#9a3412]",
  cheque: "bg-[#ede9fe] text-[#5b21b6]",
};

export function PaymentsPage() {
  const { user } = useAuth();
  const [lines, setLines] = useState<RegisterLine[] | null>(null);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<"register" | "slips">("register");
  const [kind, setKind] = useState<"all" | "Payment" | "Refund">("all");
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [manualSlips, setManualSlips] = useState<ManualSlip[]>([]);
  const allowed = can(user, "payments", "view");
  const canCreate = can(user, "payments", "add");

  useEffect(() => {
    setManualSlips(loadManualSlips());
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ payments: PaymentRow[]; refunds: RefundRow[] }>("/api/payments").then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const payments = result.data.payments.map((payment) => ({
        id: payment.id,
        href: `/payments/${payment.id}/receipt`,
        receiptNumber: payment.receiptNumber,
        kind: "Payment" as const,
        amount: payment.amount,
        method: payment.method,
        note: payment.note,
        buyerId: payment.buyerId,
        buyerName: payment.buyerName,
        buyerPhone: payment.buyerPhone,
        reference: payment.reference,
        projectName: payment.projectName,
        unitNumber: payment.unitNumber,
        at: payment.paidAt,
      }));
      const refunds = result.data.refunds.map((refund) => ({
        id: refund.id,
        href: `/payments/refunds/${refund.id}/receipt`,
        receiptNumber: refund.receiptNumber,
        kind: "Refund" as const,
        amount: refund.amount,
        method: refund.method,
        note: refund.note,
        buyerId: refund.buyerId,
        buyerName: refund.buyerName,
        buyerPhone: refund.buyerPhone,
        reference: refund.bookingReference,
        projectName: refund.projectName,
        unitNumber: refund.unitNumber,
        at: refund.refundedAt,
      }));
      setLines([...payments, ...refunds].sort((left, right) => right.at.localeCompare(left.at)));
    });
    return () => {
      active = false;
    };
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to payments.</p>;

  const payments = (lines ?? []).filter((line) => line.kind === "Payment");
  const refunds = (lines ?? []).filter((line) => line.kind === "Refund");
  const collected = addMoney(payments.map((line) => line.amount));
  const refunded = addMoney(refunds.map((line) => line.amount));
  const net = subtractMoney(collected, refunded);
  const needle = query.trim().toLowerCase();
  const shown = (lines ?? []).filter((line) => {
    if (kind !== "all" && line.kind !== kind) return false;
    if (!needle) return true;
    const text = [line.receiptNumber, line.buyerName, line.buyerPhone, line.projectName, line.unitNumber, line.reference, line.note, line.method].join(" ").toLowerCase();
    return text.includes(needle);
  });

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#047857] via-[#0f766e] to-[#2563eb] p-5 text-white shadow-[0_16px_40px_rgba(4,120,87,0.22)] sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Sales</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Payments</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Collections, refunds, and local slips. A slip is a document and is not added to collected money.</p>
          </div>
          {canCreate ? (
            <Button className="bg-white text-[#0f766e] hover:bg-[#ecfdf5]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Create slip
            </Button>
          ) : null}
        </div>
        {lines ? (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="Receipts" value={String(lines.length)} />
            <Stat label="Collected" value={formatTaka(collected)} />
            <Stat label="Refunded" value={formatTaka(refunded)} warn={refunds.length > 0} />
            <Stat label="Net" value={formatTaka(net)} />
          </dl>
        ) : null}
      </header>

      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}

      <div className="flex gap-2">
        <TabButton active={panel === "register"} onClick={() => setPanel("register")} count={lines?.length ?? 0} tone="teal">
          Register
        </TabButton>
        <TabButton active={panel === "slips"} onClick={() => setPanel("slips")} count={manualSlips.length} tone="violet">
          Slips
        </TabButton>
      </div>

      {panel === "register" ? (
        <section className="overflow-hidden rounded-[24px] border border-[#a7f3d0] bg-white shadow-[0_12px_32px_rgba(4,120,87,0.06)]">
          <div className="flex flex-col gap-3 border-b border-[#d1fae5] bg-[#f0fdf8] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["all", "All"],
                  ["Payment", "Payments"],
                  ["Refund", "Refunds"],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={kind === id}
                  onClick={() => setKind(id)}
                  className={cn("rounded-full px-3 py-1 text-xs font-semibold", kind === id ? "bg-[#0f766e] text-white" : "bg-white text-[#0f766e] ring-1 ring-[#99f6e4]")}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              className="h-11 w-full rounded-xl border border-[#a7f3d0] bg-white px-3 text-sm outline-none focus:border-[#0f766e] sm:max-w-md"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search receipt, buyer, phone, project, or unit"
              aria-label="Search payments"
            />
          </div>
          {lines === null ? (
            <p className="px-5 py-8 text-sm text-[#7d8b96]">Loading payments…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-12 text-center text-sm text-[#7d8b96]">No receipts match these filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left text-sm">
                <thead className="text-[11px] uppercase tracking-[0.14em] text-[#0f766e]">
                  <tr>
                    {["Date", "Receipt", "Buyer", "Place", "Method", "Amount", "Actions"].map((label) => (
                      <th key={label} className="px-4 py-3 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((line) => {
                    const payment = line.kind === "Payment";
                    const place = [line.projectName, line.unitNumber].filter(Boolean).join(" · ");
                    return (
                      <tr key={`${line.kind}-${line.id}`} className="border-t border-[#d1fae5]">
                        <td className="px-4 py-3 text-[#115e59]">{formatTimestamp(line.at).slice(0, 11)}</td>
                        <td className="px-4 py-3">
                          <Link href={line.href} className="font-semibold text-[#0f766e] hover:underline">
                            {line.receiptNumber}
                          </Link>
                          <p className="mt-0.5 text-xs text-[#64748b]">{line.reference || line.kind}</p>
                        </td>
                        <td className="px-4 py-3">
                          {line.buyerId ? (
                            <Link href={`/buyers/${line.buyerId}`} className="font-medium text-[#0f766e] hover:underline">
                              {line.buyerName || "Buyer"}
                            </Link>
                          ) : (
                            <span className="text-[#334155]">{line.buyerName || "—"}</span>
                          )}
                          {line.buyerPhone ? <p className="mt-0.5 text-xs text-[#9d174d]">{line.buyerPhone}</p> : null}
                        </td>
                        <td className="px-4 py-3 text-[#115e59]">{place || "—"}</td>
                        <td className="px-4 py-3">
                          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", methodTones[line.method] ?? "bg-[#f1f5f9] text-[#334155]")}>
                            {methodLabel(line.method)}
                          </span>
                        </td>
                        <td className={cn("px-4 py-3 font-semibold", payment ? "text-[#047857]" : "text-[#c2410c]")}>
                          {payment ? formatTaka(line.amount) : `Refund ${formatTaka(line.amount)}`}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-nowrap justify-end gap-1.5">
                            <ActionLink href={line.href}>View</ActionLink>
                            <ActionLink href={`${line.href}#slip-options`}>Edit</ActionLink>
                            <ActionLink href={`${line.href}?action=print`}>Print</ActionLink>
                            <ActionLink href={`${line.href}?action=download`}>Download</ActionLink>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-[24px] border border-[#ddd6fe] bg-white p-4 shadow-[0_12px_32px_rgba(91,33,182,0.05)] sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d28d9]">Documents</p>
              <h2 className="text-lg font-semibold text-[#5b21b6]">Created slips</h2>
              <p className="mt-1 text-sm text-[#6d28d9]/80">These stay on this browser. A refund slip is not taken out of collected money.</p>
            </div>
          </div>
          {manualSlips.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#7d8b96]">No slips yet. Create slip adds a payment or refund document.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {manualSlips.map((slip) => (
                <Link key={slip.id} href={`/payments/slips/${slip.id}`} className="rounded-2xl border border-[#ddd6fe] bg-[#f5f3ff] px-4 py-3">
                  <span className="flex flex-wrap gap-1.5">
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", slip.kind === "refund" ? "bg-[#ffedd5] text-[#c2410c]" : "bg-[#d1fae5] text-[#047857]")}>
                      {slip.kind === "refund" ? "Refund slip" : "Payment slip"}
                    </span>
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", slip.completed ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#f1f5f9] text-[#64748b]")}>
                      {slip.completed ? "Complete" : "Open"}
                    </span>
                  </span>
                  <span className="mt-2 block font-semibold text-[#5b21b6]">{slip.serial}</span>
                  <span className="mt-1 block text-sm text-[#334155]">
                    {slip.buyerName}
                    {slip.buyerPhone ? ` · ${slip.buyerPhone}` : ""}
                  </span>
                  <span className={cn("mt-2 block text-sm font-semibold", slip.kind === "refund" ? "text-[#c2410c]" : "text-[#0f766e]")}>{formatTaka(slip.amount)}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {creating ? (
        <CreateSlipForm
          onClose={() => {
            setCreating(false);
            setManualSlips(loadManualSlips());
          }}
        />
      ) : null}
    </div>
  );
}

function ActionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex h-8 items-center rounded-lg bg-white px-2.5 text-xs font-semibold text-[#0f766e] ring-1 ring-[#99f6e4] hover:bg-[#ecfdf5]">
      {children}
    </Link>
  );
}

function Stat({ label, value, warn = false }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", warn ? "bg-[#ffedd5] text-[#9a3412]" : "bg-white/15 text-white")}>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-80">{label}</dt>
      <dd className="mt-1 text-sm font-semibold">{value}</dd>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  count,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  tone: "teal" | "violet";
  children: string;
}) {
  const on = tone === "teal" ? "bg-[#0f766e] text-white" : "bg-[#6d28d9] text-white";
  const chip = tone === "teal" ? "bg-[#ecfdf5] text-[#0f766e]" : "bg-[#f5f3ff] text-[#6d28d9]";
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold", active ? on : "bg-white text-[#334155] ring-1 ring-[#e2e8f0]")}>
      {children}
      <span className={cn("rounded-full px-2 py-0.5 text-[11px]", active ? "bg-white/20" : chip)}>{count}</span>
    </button>
  );
}

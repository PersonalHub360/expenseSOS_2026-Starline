import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { BillForm } from "@/components/operations/BillForm";
import { OperationStatus } from "@/components/operations/OperationStatus";
import { VendorForm } from "@/components/operations/VendorForm";
import { VendorPaymentForm } from "@/components/operations/VendorPaymentForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { formatTimestamp, methodLabel, type VendorBill, type VendorPayment, type VendorProfile } from "@/lib/operations";

type Detail = {
  vendor: VendorProfile;
  bills: VendorBill[];
  payments: VendorPayment[];
  outstanding: string;
};

export function VendorDetailPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [billing, setBilling] = useState(false);
  const [paying, setPaying] = useState<VendorBill | null>(null);
  const id = params.id ?? "";

  function load() {
    api<Detail>(`/api/vendors/${id}`).then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setDetail(result.data);
      }
    });
  }

  useEffect(() => {
    if (!id || !can(user, "vendors", "view")) return;
    load();
  }, [id, user]);

  if (!can(user, "vendors", "view")) return <p className="text-sm text-[#b42318]">You do not have access to vendors.</p>;

  async function decide(path: string, decision: "approved" | "rejected") {
    const result = await api(path, { method: "POST", body: JSON.stringify({ decision, note: "" }) });
    if (!result.ok) setError(result.error);
    else {
      setNotice("Decision saved.");
      load();
    }
  }

  const canEdit = can(user, "vendors", "edit");

  return (
    <div>
      <Link href="/vendors" className="text-sm font-semibold text-[#12786c]">
        All vendors
      </Link>
      {notice ? <p className="mt-4 rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {!detail ? (
        <p className="mt-4 text-sm text-[#7d8b96]">Loading vendor…</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{detail.vendor.name}</h1>
              <p className="mt-1 text-sm text-[#5c6b76]">
                {detail.vendor.kind === "contractor" ? "Contractor" : "Supplier"}
                {detail.vendor.phone ? ` · ${detail.vendor.phone}` : ""}
                {detail.vendor.email ? ` · ${detail.vendor.email}` : ""}
              </p>
              {detail.vendor.address ? <p className="mt-1 text-sm text-[#5c6b76]">{detail.vendor.address}</p> : null}
              {detail.vendor.notes ? <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5c6b76]">{detail.vendor.notes}</p> : null}
            </div>
            <div className="text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d8b96]">Outstanding</p>
              <p className="text-2xl font-semibold">{formatTaka(detail.outstanding)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {can(user, "vendors", "edit") ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit profile
              </Button>
            ) : null}
            {can(user, "vendors", "add") ? <Button onClick={() => setBilling(true)}>Add bill</Button> : null}
          </div>

          <section className="mt-6 rounded-[22px] border border-[#eef1f4] bg-white p-4">
            <h2 className="font-semibold">Bills</h2>
            {detail.bills.length === 0 ? (
              <p className="mt-3 text-sm text-[#7d8b96]">No bills yet.</p>
            ) : (
              <ul className="mt-3 grid gap-3">
                {detail.bills.map((bill) => (
                  <li key={bill.id} className="rounded-xl border border-[#eef1f4] p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {bill.reference} · {formatTaka(bill.amount)}
                      </p>
                      <OperationStatus value={bill.status} />
                    </div>
                    <p className="mt-1 text-[#5c6b76]">
                      {bill.billDate} · due {bill.dueDate}
                      {bill.project ? ` · ${bill.project.name}` : ""}
                      {bill.description ? ` · ${bill.description}` : ""}
                    </p>
                    <p className="mt-1">Open {formatTaka(bill.outstanding)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {bill.status === "open" && can(user, "vendors", "add") ? (
                        <Button size="sm" variant="secondary" onClick={() => setPaying(bill)}>
                          Record payment
                        </Button>
                      ) : null}
                      {bill.status === "open" && canEdit ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={async () => {
                            const result = await api(`/api/vendors/bills/${bill.id}/void`, { method: "POST", body: JSON.stringify({ note: "" }) });
                            if (!result.ok) setError(result.error);
                            else {
                              setNotice("Void requested.");
                              load();
                            }
                          }}
                        >
                          Request void
                        </Button>
                      ) : null}
                      {bill.status === "pending" && canEdit && bill.requestedBy !== user?.id ? (
                        <>
                          <Button size="sm" onClick={() => decide(`/api/vendors/bills/${bill.id}/decision`, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => decide(`/api/vendors/bills/${bill.id}/decision`, "rejected")}>
                            Reject
                          </Button>
                        </>
                      ) : null}
                      {bill.status === "void_pending" && canEdit && bill.requestedBy !== user?.id ? (
                        <>
                          <Button size="sm" onClick={() => decide(`/api/vendors/bills/${bill.id}/void-decision`, "approved")}>
                            Approve void
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => decide(`/api/vendors/bills/${bill.id}/void-decision`, "rejected")}>
                            Keep bill
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-4 rounded-[22px] border border-[#eef1f4] bg-white p-4">
            <h2 className="font-semibold">Payments</h2>
            {detail.payments.length === 0 ? (
              <p className="mt-3 text-sm text-[#7d8b96]">No payments yet.</p>
            ) : (
              <ul className="mt-3 grid gap-2 text-sm">
                {detail.payments.map((payment) => (
                  <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f0f3f5] py-2">
                    <span>
                      {payment.reference} · {formatTaka(payment.amount)} · {methodLabel(payment.method)} · {formatTimestamp(payment.paidAt)}
                    </span>
                    <span className="flex items-center gap-2">
                      <OperationStatus value={payment.status} />
                      {payment.status === "pending" && canEdit && payment.requestedBy !== user?.id ? (
                        <>
                          <Button size="sm" onClick={() => decide(`/api/vendors/payments/${payment.id}/decision`, "approved")}>
                            Approve
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => decide(`/api/vendors/payments/${payment.id}/decision`, "rejected")}>
                            Reject
                          </Button>
                        </>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {editing && detail ? (
        <VendorForm
          vendor={detail.vendor}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Vendor updated.");
            load();
          }}
        />
      ) : null}
      {billing ? (
        <BillForm
          vendorId={id}
          onClose={() => setBilling(false)}
          onSaved={() => {
            setBilling(false);
            setNotice("Bill saved.");
            load();
          }}
        />
      ) : null}
      {paying ? (
        <VendorPaymentForm
          bill={paying}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null);
            setNotice("Payment saved.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}

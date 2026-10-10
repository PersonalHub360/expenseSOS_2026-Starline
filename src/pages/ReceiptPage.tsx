import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { ReceiptView } from "@/components/sales/ReceiptView";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import type { Receipt } from "@/lib/sales";

export function PaymentReceiptPage() {
  const params = useParams<{ id: string }>();
  return <ReceiptPage endpoint={`/api/payments/${params.id}/receipt`} />;
}

export function RefundReceiptPage() {
  const params = useParams<{ id: string }>();
  return <ReceiptPage endpoint={`/api/refunds/${params.id}/receipt`} />;
}

function ReceiptPage({ endpoint }: { endpoint: string }) {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const allowed = can(user, "payments", "view");

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    api<{ receipt: Receipt }>(endpoint).then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setReceipt(result.data.receipt);
    });
    return () => {
      active = false;
    };
  }, [allowed, endpoint]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to receipts.</p>;

  return (
    <div>
      <Link href="/payments" className="text-sm font-medium text-[#12786c] hover:underline print:hidden">
        All payments
      </Link>
      {error ? <p className="mt-4 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {receipt ? (
        <div className="mt-4">
          <ReceiptView receipt={receipt} />
        </div>
      ) : error ? null : (
        <p className="mt-4 text-sm text-[#7d8b96]">Loading receipt…</p>
      )}
    </div>
  );
}

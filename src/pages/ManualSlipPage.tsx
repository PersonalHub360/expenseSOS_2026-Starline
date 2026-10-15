import { useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { SlipView } from "@/components/sales/ReceiptView";
import { can } from "@/lib/access";
import { completeManualSlip, findManualSlip, manualSlipRows } from "@/lib/manualSlip";
import { methodLabel } from "@/lib/sales";

export function ManualSlipPage() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const [slip, setSlip] = useState(() => findManualSlip(params.id ?? ""));
  const allowed = can(user, "payments", "view");

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to receipts.</p>;

  return (
    <div>
      <Link href="/payments" className="text-sm font-medium text-[#12786c] hover:underline print:hidden">
        All payments
      </Link>
      {slip ? (
        <div className="mt-4">
          <SlipView
            slip={{
              title: slip.kind === "refund" ? "Refund slip" : "Payment slip",
              serial: slip.serial,
              issuedAt: slip.issuedAt,
              buyerName: slip.buyerName,
              buyerPhone: slip.buyerPhone,
              rows: manualSlipRows(slip).map((row) => (row.label === "Method" ? { ...row, value: methodLabel(row.value) } : row)),
            }}
            completion={{
              completed: slip.completed,
              onComplete: () => {
                const saved = completeManualSlip(slip.id);
                if (saved) setSlip(saved);
              },
            }}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#7d8b96]">This slip is not on this browser.</p>
      )}
    </div>
  );
}

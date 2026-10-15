import { Link } from "wouter";
import { buyerInstallmentBill, buyerInstallmentHistory } from "@/lib/installmentPlan";
import { loadManualSlips } from "@/lib/manualSlip";
import { addMoney, formatTaka } from "@/lib/money";
import { formatTimestamp, methodLabel } from "@/lib/sales";
import { InstallmentBill } from "@/components/sales/InstallmentBill";

type HistoryPayment = {
  id: string;
  receiptNumber: string;
  amount: string;
  method: string;
  paidAt: string;
  saleReference: string;
  bookingReference: string;
};

type HistoryRefund = {
  id: string;
  receiptNumber: string;
  amount: string;
  refundedAt: string;
};

type BuyerPlan = {
  name: string;
  phone: string;
  flatAmount: string;
  installmentPayment: string;
  installmentAmount: string;
  installmentSchedule: string;
};

type HistoryRow = {
  id: string;
  at: string;
  href: string;
  receipt: string;
  kind: "Downpayment" | "Monthly" | "Refund" | "Slip";
  method: string;
  reference: string;
  due: string;
  paid: string;
  adjustment: string;
  next: string;
};

export function PaymentHistory({
  buyer,
  payments,
  refunds,
}: {
  buyer: BuyerPlan;
  payments: HistoryPayment[];
  refunds: HistoryRefund[];
}) {
  const monthlyPayments = payments
    .filter((payment) => !payment.bookingReference)
    .sort((left, right) => left.paidAt.localeCompare(right.paidAt) || left.id.localeCompare(right.id));
  const steps = buyerInstallmentHistory({ ...buyer, installmentPayments: monthlyPayments.map((payment) => payment.amount) });
  const bill = buyerInstallmentBill({ ...buyer, installmentPayments: monthlyPayments.map((payment) => payment.amount) });
  const rows = historyRows(buyer, payments, refunds, steps);
  const downpayment = addMoney(payments.filter((payment) => payment.bookingReference).map((payment) => payment.amount));
  const monthly = addMoney(monthlyPayments.map((payment) => payment.amount));
  const refunded = addMoney(refunds.map((refund) => refund.amount));

  return (
    <section className="mt-4 overflow-hidden rounded-[24px] border border-[#a7f3d0] bg-white shadow-[0_12px_32px_rgba(5,150,105,0.06)]">
      <div className="flex items-center justify-between bg-gradient-to-r from-[#059669] to-[#14b8a6] px-5 py-4 text-white">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/75">Record</p>
          <h2 className="text-lg font-semibold">Payment history</h2>
        </div>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{rows.length}</span>
      </div>
      <div className="grid gap-4 p-4 sm:p-5">
        {bill ? <InstallmentBill bill={bill} /> : null}
        <dl className="grid grid-cols-3 gap-2">
          <Total label="Downpayment" value={formatTaka(downpayment)} />
          <Total label="Monthly paid" value={formatTaka(monthly)} />
          <Total label="Refunded" value={formatTaka(refunded)} />
        </dl>
        {rows.length === 0 ? (
          <p className="rounded-2xl bg-[#f8fafc] px-4 py-8 text-sm text-[#64748b]">No payment history yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#e7eef2]">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-[#f8fafc] text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Kind</th>
                  <th className="px-4 py-3">Bill due</th>
                  <th className="px-4 py-3">Paid</th>
                  <th className="px-4 py-3">Adjustment</th>
                  <th className="px-4 py-3">Next bill</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#eef2f6]">
                    <td className="px-4 py-3 text-[#5c6b76]">{formatTimestamp(row.at)}</td>
                    <td className="px-4 py-3">
                      <Link href={row.href} className="font-semibold text-[#047857] hover:underline">
                        {row.receipt}
                      </Link>
                      {row.method || row.reference ? (
                        <p className="mt-0.5 text-xs text-[#64748b]">
                          {row.method ? methodLabel(row.method) : ""}
                          {row.method && row.reference ? " · " : ""}
                          {row.reference}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 font-medium text-[#16302c]">{row.kind}</td>
                    <td className="px-4 py-3 tabular-nums text-[#334155]">{row.due}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-[#047857]">{row.paid}</td>
                    <td className="px-4 py-3 text-[#5c6b76]">{row.adjustment}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-[#312e81]">{row.next}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-[#64748b]">
          Downpayment receipts stay in this history and do not change the monthly bill. Monthly payments record the bill that was due, what was paid, and the next bill.
        </p>
      </div>
    </section>
  );
}

function historyRows(
  buyer: BuyerPlan,
  payments: HistoryPayment[],
  refunds: HistoryRefund[],
  steps: { due: string; paid: string; next: string; shortfall: string; extra: string }[] | null,
) {
  const monthly = payments
    .filter((payment) => !payment.bookingReference)
    .sort((left, right) => left.paidAt.localeCompare(right.paidAt) || left.id.localeCompare(right.id));
  const rows: HistoryRow[] = payments
    .filter((payment) => payment.bookingReference)
    .map((payment) => ({
      id: payment.id,
      at: payment.paidAt,
      href: `/payments/${payment.id}/receipt`,
      receipt: payment.receiptNumber,
      kind: "Downpayment",
      method: payment.method,
      reference: payment.bookingReference,
      due: "—",
      paid: formatTaka(payment.amount),
      adjustment: "Kept as the downpayment",
      next: "—",
    }));
  monthly.forEach((payment, index) => {
    const step = steps?.[index];
    rows.push({
      id: payment.id,
      at: payment.paidAt,
      href: `/payments/${payment.id}/receipt`,
      receipt: payment.receiptNumber,
      kind: "Monthly",
      method: payment.method,
      reference: payment.saleReference,
      due: step ? formatTaka(step.due) : "—",
      paid: formatTaka(payment.amount),
      adjustment: step ? adjustmentText(step.shortfall, step.extra) : "Recorded",
      next: step ? formatTaka(step.next) : "—",
    });
  });
  for (const slip of loadManualSlips()) {
    if (!slip.completed || !samePerson(slip.buyerName, slip.buyerPhone, buyer.name, buyer.phone)) continue;
    rows.push({
      id: slip.id,
      at: slip.completedAt || slip.issuedAt,
      href: `/payments/slips/${slip.id}`,
      receipt: slip.serial,
      kind: "Slip",
      method: slip.method,
      reference: slip.projectName,
      due: "—",
      paid: formatTaka(slip.amount),
      adjustment: "Payment complete. Not added to collected money",
      next: "—",
    });
  }
  for (const refund of refunds) {
    rows.push({
      id: refund.id,
      at: refund.refundedAt,
      href: `/payments/refunds/${refund.id}/receipt`,
      receipt: refund.receiptNumber,
      kind: "Refund",
      method: "",
      reference: "",
      due: "—",
      paid: formatTaka(refund.amount),
      adjustment: "Refund record",
      next: "—",
    });
  }
  return rows.sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));
}

function samePerson(leftName: string, leftPhone: string, rightName: string, rightPhone: string) {
  const phone = (value: string) => value.replace(/\s/g, "");
  return leftName.trim().toLowerCase() === rightName.trim().toLowerCase() && phone(leftPhone) === phone(rightPhone);
}

function adjustmentText(shortfall: string, extra: string) {
  if (shortfall !== "0.00") return `${formatTaka(shortfall)} added to the next bill`;
  if (extra !== "0.00") return `${formatTaka(extra)} adjusted off the next bill`;
  return "Paid the bill in full";
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#f8fafc] px-3 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#64748b]">{label}</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums text-[#16302c]">{value}</dd>
    </div>
  );
}

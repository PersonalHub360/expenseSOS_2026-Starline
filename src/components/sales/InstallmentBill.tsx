import { formatTaka } from "@/lib/money";
import type { NextBill } from "@/lib/installmentPlan";

export function InstallmentBill({ bill }: { bill: NextBill }) {
  return (
    <div className="rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] px-4 py-3 text-[#14532d]">
      <div className="grid gap-3 sm:grid-cols-2">
        <p>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#047857]">Monthly installment</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums">{formatTaka(bill.monthly)}</span>
        </p>
        <p>
          <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-[#047857]">Next bill</span>
          <span className="mt-1 block text-lg font-semibold tabular-nums">{formatTaka(bill.next)}</span>
        </p>
      </div>
      <p className="mt-2 text-sm">{billNote(bill)}</p>
    </div>
  );
}

export function billNote(bill: NextBill) {
  if (bill.left === "0.00") return "The installment balance is clear. This bill is not added to received money.";
  if (bill.added !== "0.00") return `${formatTaka(bill.added)} still due is added to the next bill. A larger payment is adjusted off the bills after it.`;
  if (bill.reduced !== "0.00") return `${formatTaka(bill.reduced)} extra from the last payment is adjusted off this bill.`;
  if (bill.next !== bill.monthly) return "The next bill is the remaining balance.";
  return "The next bill is the monthly installment. Pay less and the rest is added next time. Pay more and the extra is adjusted off the next bill.";
}

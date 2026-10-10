import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { salaryStatusLabels, type SalarySlipRow } from "@/lib/finance";
import { formatTaka } from "@/lib/money";

type SlipResponse = {
  slip: SalarySlipRow;
  employee: { id: string; name: string; jobTitle: string };
};

export function SalarySlipPage() {
  const params = useParams<{ id: string; slipId: string }>();
  const { user } = useAuth();
  const employeeId = params.id ?? "";
  const slipId = params.slipId ?? "";
  const [detail, setDetail] = useState<SlipResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!employeeId || !slipId || !can(user, "employees", "view")) return;
    api<SlipResponse>(`/api/employees/${employeeId}/slips/${slipId}`).then((result) => {
      if (!result.ok) setError(result.error);
      else setDetail(result.data);
    });
  }, [employeeId, slipId, user]);

  if (!can(user, "employees", "view")) return <p className="text-sm text-[#b42318]">You do not have access to employees.</p>;
  if (error) return <p className="text-sm text-[#b42318]">{error}</p>;
  if (!detail) return <p className="text-sm text-[#7d8b96]">Loading salary slip…</p>;

  const { slip, employee } = detail;
  const rows = [
    ["Base salary", slip.baseSalary],
    ["Bonus", slip.bonus],
    ["Deduction", slip.deduction],
    ["Advance", slip.advance],
  ] as const;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 print:hidden">
        <Link href={`/employees/${employee.id}`} className="text-sm font-medium text-[#12786c] hover:underline">
          {employee.name}
        </Link>
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          Print slip
        </Button>
      </div>
      <article className="mx-auto mt-6 max-w-xl rounded-[22px] border border-[#eef1f4] bg-white p-6 print:mt-0 print:max-w-none print:rounded-none print:border-0">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#7d8b96]">Salary slip</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{employee.name}</h1>
        <p className="mt-1 text-sm text-[#5c6b76]">
          {employee.jobTitle || "Staff"} · {slip.period} · {salaryStatusLabels[slip.status]}
          {slip.paidOn ? ` · paid ${slip.paidOn}` : ""}
        </p>
        <table className="mt-6 w-full text-sm">
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label} className="border-t border-[#f0f3f5]">
                <th className="py-3 text-left font-medium">{label}</th>
                <td className="py-3 text-right">{formatTaka(value)}</td>
              </tr>
            ))}
            <tr className="border-t border-[#d7e0e4]">
              <th className="py-3 text-left text-base font-semibold">Net pay</th>
              <td className="py-3 text-right text-base font-semibold">{formatTaka(slip.net)}</td>
            </tr>
          </tbody>
        </table>
        {slip.note ? <p className="mt-4 text-sm text-[#5c6b76]">{slip.note}</p> : null}
      </article>
    </div>
  );
}

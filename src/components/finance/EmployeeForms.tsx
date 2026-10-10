import { type FormEvent, useState } from "react";
import { Dialog, FieldError, fieldClass } from "@/components/inventory/Dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { addMoney, compareMoney, normalizeMoney, subtractMoney } from "@/lib/money";
import { employeeStatuses, salaryStatuses, salaryStatusLabels, type EmployeeRow, type SalarySlipRow } from "@/lib/finance";

export function EmployeeForm({ onClose, onSaved }: { onClose: () => void; onSaved: (employee: EmployeeRow) => void }) {
  const [name, setName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("");
  const [status, setStatus] = useState<(typeof employeeStatuses)[number]>("active");
  const [joinedOn, setJoinedOn] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api<{ employee: EmployeeRow }>("/api/employees", {
      method: "POST",
      body: JSON.stringify({ name, jobTitle, phone, email, address, notes, monthlySalary, status, joinedOn }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.employee);
  }

  return (
    <Dialog title="Add employee" onClose={onClose} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-sm font-medium">
          Name
          <input className={`${fieldClass} mt-1.5`} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Job title
          <input className={`${fieldClass} mt-1.5`} value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Phone
          <input className={`${fieldClass} mt-1.5`} value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Email
          <input className={`${fieldClass} mt-1.5`} value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Address
          <input className={`${fieldClass} mt-1.5`} value={address} onChange={(event) => setAddress(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Monthly salary
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={monthlySalary} onChange={(event) => setMonthlySalary(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Status
          <select className={`${fieldClass} mt-1.5`} value={status} onChange={(event) => setStatus(event.target.value as (typeof employeeStatuses)[number])}>
            {employeeStatuses.map((item) => (
              <option key={item} value={item}>
                {salaryStatusLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Joined on
          <input className={`${fieldClass} mt-1.5`} type="date" value={joinedOn} onChange={(event) => setJoinedOn(event.target.value)} />
        </label>
        <label className="text-sm font-medium sm:col-span-2">
          Notes
          <textarea className={`${fieldClass} mt-1.5 min-h-20`} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="sm:col-span-2">
          <FieldError message={error} />
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save employee
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}

export function SalarySlipForm({
  employeeId,
  baseSalary,
  onClose,
  onSaved,
}: {
  employeeId: string;
  baseSalary: string;
  onClose: () => void;
  onSaved: (slip: SalarySlipRow) => void;
}) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [base, setBase] = useState(baseSalary);
  const [bonus, setBonus] = useState("0");
  const [deduction, setDeduction] = useState("0");
  const [advance, setAdvance] = useState("0");
  const [status, setStatus] = useState<(typeof salaryStatuses)[number]>("scheduled");
  const [paidOn, setPaidOn] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const net = previewNet(base, bonus, deduction, advance);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError("");
    const result = await api<{ slip: SalarySlipRow }>(`/api/employees/${employeeId}/slips`, {
      method: "POST",
      body: JSON.stringify({ period, baseSalary: base, bonus, deduction, advance, status, paidOn, note }),
    });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved(result.data.slip);
  }

  return (
    <Dialog title="Record salary" onClose={onClose} wide>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-sm font-medium">
          Month
          <input className={`${fieldClass} mt-1.5`} type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Base salary
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={base} onChange={(event) => setBase(event.target.value)} required />
        </label>
        <label className="text-sm font-medium">
          Bonus
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={bonus} onChange={(event) => setBonus(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Deduction
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={deduction} onChange={(event) => setDeduction(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Advance
          <input className={`${fieldClass} mt-1.5`} inputMode="decimal" value={advance} onChange={(event) => setAdvance(event.target.value)} />
        </label>
        <label className="text-sm font-medium">
          Status
          <select className={`${fieldClass} mt-1.5`} value={status} onChange={(event) => setStatus(event.target.value as (typeof salaryStatuses)[number])}>
            {salaryStatuses.map((item) => (
              <option key={item} value={item}>
                {salaryStatusLabels[item]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Payment date
          <input className={`${fieldClass} mt-1.5`} type="date" value={paidOn} onChange={(event) => setPaidOn(event.target.value)} />
        </label>
        <p className="text-sm text-[#5c6b76] sm:col-span-2">Net pay {net || "—"}</p>
        <label className="text-sm font-medium sm:col-span-2">
          Note
          <input className={`${fieldClass} mt-1.5`} value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className="sm:col-span-2 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            Save slip
          </Button>
        </div>
        <div className="sm:col-span-2">
          <FieldError message={error} />
        </div>
      </form>
    </Dialog>
  );
}

function previewNet(base: string, bonus: string, deduction: string, advance: string) {
  const parts = [base, bonus, deduction, advance].map((value) => normalizeMoney(value));
  if (parts.some((value) => !value)) return "";
  const [baseSalary, bonusAmount, deductionAmount, advanceAmount] = parts as [string, string, string, string];
  const gross = addMoney([baseSalary, bonusAmount]);
  const withheld = addMoney([deductionAmount, advanceAmount]);
  if (compareMoney(withheld, gross) > 0) return "would be below zero";
  return subtractMoney(gross, withheld);
}

import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Download, Plus, Search, UserPlus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { AddInvestorForm } from "@/components/finance/AddInvestorForm";
import { ContributionForm } from "@/components/finance/ContributionForm";
import { InvestmentForm } from "@/components/finance/InvestmentForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { formatWhen, investmentStatusLabels, type InvestmentRow, type InvestorOption } from "@/lib/finance";
import { methodLabel } from "@/lib/sales";
import { addMoney, compareMoney, formatShare, formatTaka, shareOfCapital, subtractMoney, toCents } from "@/lib/money";

type ListResponse = { investments: InvestmentRow[]; received: string; returned: string; outstanding: string };

type SlipFile = {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
};

const cardTones = [
  { share: "text-[#6d28d9]", chip: "bg-[#ede9fe] text-[#6d28d9]", bar: "bg-[#7c3aed]" },
  { share: "text-[#059669]", chip: "bg-[#d1fae5] text-[#047857]", bar: "bg-[#10b981]" },
  { share: "text-[#0284c7]", chip: "bg-[#e0f2fe] text-[#0369a1]", bar: "bg-[#0ea5e9]" },
  { share: "text-[#7c3aed]", chip: "bg-[#f3e8ff] text-[#7c3aed]", bar: "bg-[#8b5cf6]" },
];

export function InvestmentsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<InvestmentRow[] | null>(null);
  const [received, setReceived] = useState("0.00");
  const [returned, setReturned] = useState("0.00");
  const [outstanding, setOutstanding] = useState("0.00");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [recording, setRecording] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InvestmentRow | null>(null);
  const [confirmRecordId, setConfirmRecordId] = useState<string | null>(null);
  const [removingRecordId, setRemovingRecordId] = useState("");
  const [editingPerson, setEditingPerson] = useState<InvestorPerson | null>(null);
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [removingKey, setRemovingKey] = useState("");
  const [addingInvestor, setAddingInvestor] = useState(false);
  const [directory, setDirectory] = useState<InvestorOption[]>([]);
  const [slips, setSlips] = useState<Record<string, SlipFile[]>>({});
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const allowed = can(user, "investments", "view");

  function loadInvestors() {
    api<{ investors: InvestorOption[] }>("/api/investors").then((result) => {
      if (result.ok) setDirectory(result.data.investors);
    });
  }

  async function removePerson(person: InvestorPerson) {
    setRemovingKey(person.key);
    setError("");
    const result = person.id
      ? await api(`/api/investors/${person.id}`, { method: "DELETE" })
      : await api("/api/investors/named", { method: "DELETE", body: JSON.stringify({ name: person.name }) });
    setRemovingKey("");
    setConfirmKey(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Investor deleted.");
    load();
    loadInvestors();
  }

  function askRemoveRecord(row: InvestmentRow) {
    setNotice("");
    if (compareMoney(row.returned, "0.00") > 0) {
      setConfirmRecordId(null);
      setError("This contribution has a return and cannot be deleted.");
      return;
    }
    setError("");
    setConfirmRecordId(row.id);
  }

  async function removeRecord(row: InvestmentRow) {
    if (compareMoney(row.returned, "0.00") > 0) {
      setConfirmRecordId(null);
      setError("This contribution has a return and cannot be deleted.");
      return;
    }
    setRemovingRecordId(row.id);
    setError("");
    const result = await api(`/api/investments/${row.id}`, { method: "DELETE" });
    setRemovingRecordId("");
    setConfirmRecordId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Contribution deleted.");
    load();
    loadInvestors();
  }

  function loadSlips(ids: string[]) {
    Promise.all(
      ids.map(async (id) => {
        const result = await api<{ files: SlipFile[] }>(`/api/files?subjectType=investment&subjectId=${id}`);
        return [id, result.ok ? result.data.files : []] as const;
      }),
    ).then((entries) => setSlips(Object.fromEntries(entries)));
  }

  function load() {
    api<ListResponse>("/api/investments").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setRows(result.data.investments);
        setReceived(result.data.received);
        setReturned(result.data.returned);
        setOutstanding(result.data.outstanding);
        loadSlips(result.data.investments.map((row) => row.id));
      }
    });
  }

  useEffect(() => {
    if (allowed) {
      load();
      loadInvestors();
    }
  }, [allowed]);

  const people = useMemo(() => investorPeople(directory, rows ?? [], received), [directory, rows, received]);
  const payable = rows ? addMoney(rows.map((item) => item.payable)) : "0.00";
  const settled = percentOf(returned, payable);
  const shown = (rows ?? []).filter((item) => {
    const haystack = `${item.investorName} ${item.purpose} ${item.project?.name ?? ""} ${item.note}`.toLowerCase();
    if (query.trim() && !haystack.includes(query.trim().toLowerCase())) return false;
    if (status !== "all" && item.status !== status) return false;
    return true;
  });
  const visiblePeople = people.filter((person) => {
    if (query.trim() && !person.name.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (status !== "all" && !person.records.some((record) => record.status === status)) return false;
    return true;
  });
  const sharePoints = people.reduce((sum, person) => sum + Number(BigInt(person.shareBps) / 100n), 0);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to investments.</p>;

  const latest = rows?.[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1e1b4b]">Investment Management</h1>
          <p className="mt-1 text-sm text-[#64748b]">Track capital, investor shares, and contribution records.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => downloadCsv("investors.csv", peopleCsv(people))}>
            <Download className="h-4 w-4" />
            Investors CSV
          </Button>
          <Button variant="secondary" onClick={() => downloadCsv("contributions.csv", contributionCsv(rows ?? []))}>
            <Download className="h-4 w-4" />
            Contributions CSV
          </Button>
          {can(user, "investments", "add") ? (
            <Button variant="secondary" onClick={() => setAddingInvestor(true)}>
              <UserPlus className="h-4 w-4" />
              Add investor
            </Button>
          ) : null}
          {can(user, "investments", "add") ? (
            <Button className="bg-[#7c3aed] hover:bg-[#6d28d9]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              Add Capital
            </Button>
          ) : null}
        </div>
      </div>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {directory.length > 0 ? (
        <section className="rounded-[22px] border border-[#e9e4f5] bg-white p-4">
          <p className="text-sm font-semibold text-[#1e1b4b]">Saved investors</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {directory.map((investor) => {
              const percent = formatShare(investor.shareBps).replace("%", "");
              const amount = shareOfCapital(received, percent);
              return (
                <li key={investor.id} className="rounded-full bg-[#f5f3ff] px-3 py-1.5 text-sm text-[#5b21b6]">
                  <span className="font-semibold">{investor.name}</span>
                  <span className="text-[#7c3aed]"> · {formatShare(investor.shareBps)}</span>
                  {amount ? <span className="text-[#7c3aed]"> · {formatTaka(amount)}</span> : null}
                  {investor.phone ? <span className="text-[#7c3aed]"> · {investor.phone}</span> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="bg-gradient-to-br from-[#7c3aed] to-[#6d28d9]" label="Total capital" value={formatTaka(received)} detail={latest ? `Updated ${formatWhen(latest.investedAt)}` : "No capital recorded"} />
        <StatCard tone="bg-gradient-to-br from-[#0284c7] to-[#0ea5e9]" label="Investors" value={String(people.length)} detail={`${sharePoints} share points assigned`} />
        <StatCard tone="bg-gradient-to-br from-[#059669] to-[#10b981]" label="Total paid back" value={formatTaka(returned)} detail={`${settled} of payable returned`} />
        <StatCard
          tone={compareMoney(outstanding, "0.00") < 0 ? "bg-gradient-to-br from-[#dc2626] to-[#b91c1c]" : "bg-gradient-to-br from-[#f59e0b] to-[#f97316]"}
          label="Remaining"
          value={formatTaka(outstanding)}
          detail={`${rows?.length ?? 0} capital records`}
        />
      </section>

      <section className="rounded-[22px] border border-[#e9e4f5] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p className="font-semibold text-[#334155]">Capital return progress</p>
          <p className="font-semibold text-[#7c3aed]">{settled}</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#f1eef8]">
          <div className="h-full rounded-full bg-gradient-to-r from-[#34d399] to-[#10b981]" style={{ width: settled }} />
        </div>
        <div className="mt-2 flex justify-between text-xs text-[#94a3b8]">
          <span>Returned {formatTaka(returned)}</span>
          <span>Still payable {formatTaka(outstanding)}</span>
        </div>
      </section>

      <section className="rounded-[22px] border border-[#e9e4f5] bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[#1e1b4b]">Investors</h2>
            <p className="text-sm text-[#64748b]">{visiblePeople.length} shown · share, given, and remaining</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#94a3b8]" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search investors" aria-label="Search investors" className="h-11 rounded-xl border border-[#e9e4f5] bg-[#faf8ff] pl-9 pr-3 text-sm" />
            </label>
            <select value={status} aria-label="Filter by status" onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border border-[#e9e4f5] bg-[#faf8ff] px-3 text-sm">
              <option value="all">All status</option>
              <option value="received">Received</option>
              <option value="partial">Partially returned</option>
              <option value="returned">Returned</option>
            </select>
          </div>
        </div>
        {rows === null ? (
          <p className="py-8 text-sm text-[#7d8b96]">Loading investments…</p>
        ) : visiblePeople.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#7d8b96]">No investors match.</p>
        ) : (
          <div className="mt-4 grid gap-3 xl:grid-cols-2">
            {visiblePeople.map((person, index) => {
              const tone = cardTones[index % cardTones.length];
              return (
                <article key={person.key} className="rounded-2xl border border-[#efeaf8] bg-white p-4 shadow-[0_8px_24px_rgba(76,29,149,0.04)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-10 w-10 place-items-center rounded-xl text-sm font-semibold text-white ${tone.bar}`}>{person.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <p className="font-semibold text-[#1e1b4b]">{person.name}</p>
                        <p className="text-xs text-[#94a3b8]">{person.records.length} record{person.records.length === 1 ? "" : "s"}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {confirmKey === person.key ? (
                        <>
                          <Button type="button" variant="secondary" onClick={() => setConfirmKey(null)}>
                            Keep
                          </Button>
                          <Button type="button" onClick={() => removePerson(person)} disabled={removingKey === person.key}>
                            Delete
                          </Button>
                        </>
                      ) : (
                        <>
                          {can(user, "investments", "edit") ? (
                            <Button type="button" variant="secondary" onClick={() => setEditingPerson(person)}>
                              Edit
                            </Button>
                          ) : null}
                          {can(user, "investments", "delete") ? (
                            <Button type="button" variant="secondary" onClick={() => setConfirmKey(person.key)}>
                              Delete
                            </Button>
                          ) : null}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                    <Mini label="Share" value={person.shareBps > 0 ? formatShare(person.shareBps) : "Not set"} className="bg-[#f5f3ff] text-[#6d28d9]" />
                    <Mini label="Given" value={formatTaka(person.given)} className="bg-[#ecfdf5] text-[#047857]" />
                    <Mini
                      label="Remaining"
                      value={formatTaka(person.remaining)}
                      className={compareMoney(person.remaining, "0.00") < 0 ? "bg-[#fee2e2] text-[#b91c1c]" : "bg-[#fff7ed] text-[#c2410c]"}
                    />
                  </div>
                  {person.shareBps > 0 ? <p className="mt-2 text-xs text-[#64748b]">Share amount {formatTaka(person.shareAmount)}. Remaining is that amount minus what they have given.</p> : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[22px] border border-[#e9e4f5] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-[#1e1b4b]">Contribution records</h2>
            <p className="text-sm text-[#64748b]">{shown.length} of {rows?.length ?? 0} records</p>
          </div>
          {can(user, "investments", "add") ? (
            <Button className="bg-[#7c3aed] hover:bg-[#6d28d9]" onClick={() => setRecording(true)}>
              <Plus className="h-4 w-4" />
              Add contribution
            </Button>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {investorTotals(rows ?? []).map((item) => (
            <p key={item.name} className="rounded-full bg-[#f5f3ff] px-3 py-1.5 text-sm text-[#5b21b6]">
              <span className="font-semibold">{item.name}</span>
              <span> · {formatTaka(item.total)}</span>
              <span className="text-[#7c3aed]"> · {item.count} contribution{item.count === 1 ? "" : "s"}</span>
            </p>
          ))}
        </div>
        {shown.length === 0 ? (
          <p className="py-10 text-center text-sm text-[#94a3b8]">No contributions found</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="text-[11px] uppercase tracking-[0.12em] text-[#94a3b8]">
                <tr>
                  <th className="pb-3 font-semibold">Date</th>
                  <th className="pb-3 font-semibold">Investor</th>
                  <th className="pb-3 font-semibold">Amount</th>
                  <th className="pb-3 font-semibold">Method</th>
                  <th className="pb-3 font-semibold">Category</th>
                  <th className="pb-3 font-semibold">Reference</th>
                  <th className="pb-3 font-semibold">Note</th>
                  <th className="pb-3 font-semibold">Slip</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((item) => (
                  <tr key={item.id} className="border-t border-[#f4f0fa]">
                    <td className="py-3">{formatWhen(item.investedAt)}</td>
                    <td className="py-3 font-semibold">
                      {item.investorName ? (
                        <Link href={`/investments/${item.id}`} className="text-[#6d28d9] hover:underline">
                          {item.investorName}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 font-semibold">{formatTaka(item.received)}</td>
                    <td className="py-3">{methodLabel(item.method)}</td>
                    <td className="py-3">{item.purpose || item.project?.name || "Capital"}</td>
                    <td className="py-3 text-[#64748b]">{item.reference || "—"}</td>
                    <td className="py-3 text-[#64748b]">{item.note || "—"}</td>
                    <td className="py-3"><SlipCell files={slips[item.id]} /></td>
                    <td className="py-3"><StatusPill status={item.status} /></td>
                    <td className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {confirmRecordId === item.id ? (
                          <>
                            <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmRecordId(null)}>
                              Keep
                            </Button>
                            <Button type="button" size="sm" onClick={() => removeRecord(item)} disabled={removingRecordId === item.id}>
                              Delete
                            </Button>
                          </>
                        ) : (
                          <>
                            {can(user, "investments", "edit") ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setRecording(false);
                                  setConfirmRecordId(null);
                                  setEditingRecord(item);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                            <Link href={`/investments/${item.id}`} className="inline-flex h-9 items-center rounded-xl border border-[#e9e4f5] bg-white px-3 text-sm font-semibold text-[#1e1b4b] hover:bg-[#faf8ff]">
                              View
                            </Link>
                            {can(user, "investments", "delete") ? (
                              <Button type="button" variant="secondary" size="sm" onClick={() => askRemoveRecord(item)}>
                                Delete
                              </Button>
                            ) : null}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editingPerson ? (
        <AddInvestorForm
          capital={received}
          initial={editingPerson}
          onClose={() => setEditingPerson(null)}
          onSaved={() => {
            setEditingPerson(null);
            setNotice("Investor updated.");
            load();
            loadInvestors();
          }}
        />
      ) : null}
      {addingInvestor ? (
        <AddInvestorForm
          capital={received}
          onClose={() => setAddingInvestor(false)}
          onSaved={(investor) => {
            setAddingInvestor(false);
            setNotice(`${investor.name} added. Choose this name when you record capital.`);
            loadInvestors();
          }}
        />
      ) : null}
      {recording || editingRecord ? (
        <ContributionForm
          investors={contributionInvestors(directory, rows ?? [])}
          categories={contributionCategories(rows ?? [])}
          editing={editingRecord}
          onClose={() => {
            setRecording(false);
            setEditingRecord(null);
          }}
          onSaved={(warning) => {
            const updated = Boolean(editingRecord);
            setRecording(false);
            setEditingRecord(null);
            setNotice(warning ?? (updated ? "Contribution updated." : "Contribution recorded."));
            load();
            loadInvestors();
          }}
        />
      ) : null}
      {creating ? (
        <InvestmentForm
          rows={rows ?? []}
          onClose={() => setCreating(false)}
          onChanged={(message) => {
            setNotice(message);
            load();
            loadInvestors();
          }}
        />
      ) : null}
    </div>
  );
}

function StatCard({ tone, label, value, detail }: { tone: string; label: string; value: string; detail: string }) {
  return (
    <article className={`${tone} rounded-2xl p-4 text-white shadow-[0_12px_30px_rgba(76,29,149,0.12)]`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value}</p>
      <p className="mt-2 text-xs text-white/80">{detail}</p>
    </article>
  );
}

function Mini({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className={`rounded-xl px-2 py-2 ${className}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}

function SlipCell({ files }: { files?: SlipFile[] }) {
  if (!files || files.length === 0) return <span className="text-xs text-[#94a3b8]">No slip</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {files.map((file) =>
        file.contentType.startsWith("image/") ? (
          <a key={file.id} href={`/api/files/${file.id}`} title={file.title || file.fileName} className="block overflow-hidden rounded-lg border border-[#ede9fe]">
            <img src={`/api/files/${file.id}?inline=1`} alt={file.title || file.fileName} className="h-12 w-12 object-cover" />
          </a>
        ) : (
          <a key={file.id} href={`/api/files/${file.id}`} className="inline-flex h-12 max-w-[8rem] items-center rounded-lg bg-[#fff1f2] px-2 text-xs font-semibold text-[#9f1239]">
            <span className="truncate">{file.title || "Slip"}</span>
          </a>
        ),
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status === "returned" ? "bg-[#d1fae5] text-[#047857]" : status === "partial" ? "bg-[#ffedd5] text-[#c2410c]" : "bg-[#ffe4e6] text-[#be123c]";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{investmentStatusLabels[status] ?? status}</span>;
}

function investorTotals(rows: InvestmentRow[]) {
  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const name = row.investorName.trim();
    if (!name) continue;
    grouped.set(name, [...(grouped.get(name) ?? []), row.received]);
  }
  return [...grouped.entries()]
    .map(([name, amounts]) => ({ name, total: addMoney(amounts), count: amounts.length }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function contributionInvestors(directory: InvestorOption[], rows: InvestmentRow[]) {
  return [...new Set([...directory.map((item) => item.name), ...rows.map((item) => item.investorName)].map((name) => name.trim()).filter(Boolean))].sort((left, right) =>
    left.localeCompare(right),
  );
}

const baseCategories = ["Land purchase", "Land fill", "Construction", "Legal", "Registration", "Development", "Other"];

function contributionCategories(rows: InvestmentRow[]) {
  return [...new Set([...baseCategories, ...rows.map((item) => item.purpose.trim()).filter(Boolean)])].sort((left, right) => left.localeCompare(right));
}

function investorPeople(directory: InvestorOption[], rows: InvestmentRow[], capital: string): InvestorPerson[] {
  const byName = new Map<string, InvestmentRow[]>();
  for (const row of rows) {
    const name = row.investorName.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  const seen = new Set<string>();
  const people: InvestorPerson[] = [];
  for (const investor of directory) {
    const name = investor.name.trim();
    const key = name.toLocaleLowerCase();
    seen.add(key);
    people.push(investorPerson({ id: investor.id, name, phone: investor.phone, note: investor.note, shareBps: investor.shareBps }, byName.get(key) ?? [], capital));
  }
  for (const [key, records] of byName) {
    if (seen.has(key)) continue;
    people.push(investorPerson({ id: null, name: records[0]?.investorName.trim() || key, phone: "", note: "", shareBps: 0 }, records, capital));
  }
  return people.sort((left, right) => left.name.localeCompare(right.name));
}

function investorPerson(
  profile: { id: string | null; name: string; phone: string; note: string; shareBps: number },
  records: InvestmentRow[],
  capital: string,
): InvestorPerson {
  const percent = formatShare(profile.shareBps).replace("%", "");
  const shareAmount = profile.shareBps > 0 ? (shareOfCapital(capital, percent) ?? "0.00") : "0.00";
  const given = records.length > 0 ? addMoney(records.map((record) => record.received)) : "0.00";
  const outstanding = records.length > 0 ? addMoney(records.map((record) => record.outstanding)) : "0.00";
  const remaining = profile.shareBps > 0 ? subtractMoney(shareAmount, given) : outstanding;
  return { key: profile.name.toLocaleLowerCase(), ...profile, shareAmount, given, remaining, records };
}

type InvestorPerson = {
  key: string;
  id: string | null;
  name: string;
  phone: string;
  note: string;
  shareBps: number;
  shareAmount: string;
  given: string;
  remaining: string;
  records: InvestmentRow[];
};

function peopleCsv(people: InvestorPerson[]) {
  return [
    ["Investor", "Share", "Share amount", "Given", "Remaining"],
    ...people.map((person) => [person.name, formatShare(person.shareBps), person.shareAmount, person.given, person.remaining]),
  ];
}

function percentOf(part: string, whole: string) {
  const partCents = toCents(part);
  const wholeCents = toCents(whole);
  if (partCents === null || wholeCents === null || wholeCents <= 0n) return "0.00%";
  if (compareMoney(part, whole) >= 0) return "100.00%";
  const bps = (partCents * 10000n) / wholeCents;
  return `${bps / 100n}.${(bps % 100n).toString().padStart(2, "0")}%`;
}

function contributionCsv(rows: InvestmentRow[]) {
  return [
    ["Date", "Investor", "Amount", "Method", "Category", "Note", "Status"],
    ...rows.map((row) => [formatWhen(row.investedAt), row.investorName, row.received, row.method, row.purpose || row.project?.name || "Capital", row.note, row.status]),
  ];
}

function downloadCsv(name: string, rows: string[][]) {
  const body = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(",")).join("\n");
  const blob = new Blob([body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

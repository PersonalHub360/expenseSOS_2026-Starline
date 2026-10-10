import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Plus } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { VendorForm } from "@/components/operations/VendorForm";
import { Button } from "@/components/ui/button";
import { can } from "@/lib/access";
import { api } from "@/lib/api";
import { addMoney, formatTaka } from "@/lib/money";
import { operationStatusLabels, type VendorRow } from "@/lib/operations";

export function VendorsPage() {
  const { user } = useAuth();
  const [vendors, setVendors] = useState<VendorRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const allowed = can(user, "vendors", "view");

  function load() {
    api<{ vendors: VendorRow[] }>("/api/vendors").then((result) => {
      if (!result.ok) setError(result.error);
      else {
        setError("");
        setVendors(result.data.vendors);
      }
    });
  }

  useEffect(() => {
    if (!allowed) return;
    load();
  }, [allowed]);

  if (!allowed) return <p className="text-sm text-[#b42318]">You do not have access to vendors.</p>;

  const outstanding = addMoney((vendors ?? []).map((vendor) => vendor.outstanding));
  const bills = (vendors ?? []).reduce((sum, vendor) => sum + vendor.bills, 0);

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-[28px] bg-gradient-to-r from-[#9a3412] via-[#c2410c] to-[#ca8a04] p-5 text-white shadow-[0_16px_40px_rgba(154,52,18,0.22)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Operations</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Vendors</h1>
            <p className="mt-1 max-w-xl text-sm text-white/80">Suppliers and contractors, with bills, phone, and what is still unpaid.</p>
          </div>
          {can(user, "vendors", "add") ? (
            <Button className="bg-white text-[#9a3412] hover:bg-[#fff7ed]" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              New vendor
            </Button>
          ) : null}
        </div>
        <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold">
          <span className="rounded-full bg-white/15 px-3 py-1">{vendors?.length ?? 0} vendors</span>
          <span className="rounded-full bg-[#ffedd5] px-3 py-1 text-[#9a3412]">{bills} bills</span>
          <span className="rounded-full bg-[#ffe4e6] px-3 py-1 text-[#9f1239]">Outstanding {formatTaka(outstanding)}</span>
        </div>
      </header>
      {notice ? <p className="rounded-xl bg-[#e7f6f2] px-3 py-2 text-sm text-[#0f6f62]">{notice}</p> : null}
      {error ? <p className="rounded-xl bg-[#fdeceb] px-3 py-2 text-sm text-[#b42318]">{error}</p> : null}
      {vendors === null ? (
        <p className="text-sm text-[#7d8b96]">Loading vendors…</p>
      ) : vendors.length === 0 ? (
        <p className="rounded-[22px] bg-white px-4 py-10 text-center text-sm text-[#7d8b96]">No vendors yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {vendors.map((vendor) => (
            <article key={vendor.id} className="rounded-[22px] border border-[#fed7aa] bg-white p-4 shadow-[0_10px_28px_rgba(22,40,36,0.04)]">
              <div className="flex items-start justify-between gap-3">
                <Link href={`/vendors/${vendor.id}`} className="text-lg font-semibold text-[#9a3412] hover:underline">{vendor.name}</Link>
                <span className="rounded-full bg-[#ffedd5] px-2.5 py-1 text-[11px] font-semibold text-[#9a3412]">{operationStatusLabels[vendor.kind]}</span>
              </div>
              <p className="mt-2 text-sm text-[#7c2d12]">{vendor.phone || "No phone"}{vendor.email ? ` · ${vendor.email}` : ""}</p>
              <div className="mt-4 flex items-end justify-between text-sm">
                <span className="rounded-full bg-[#fff7ed] px-2.5 py-1 font-semibold text-[#9a3412]">{vendor.bills} bills</span>
                <p className="text-lg font-semibold text-[#be123c]">{formatTaka(vendor.outstanding)}</p>
              </div>
            </article>
          ))}
        </div>
      )}
      {creating ? (
        <VendorForm
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            setNotice("Vendor saved.");
            load();
          }}
        />
      ) : null}
    </div>
  );
}

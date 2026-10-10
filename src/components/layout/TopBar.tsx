import { useEffect, useId, useRef, useState } from "react";
import { Link } from "wouter";
import { Bell, Menu, Search, Settings } from "lucide-react";
import { api } from "@/lib/api";
import { formatTaka } from "@/lib/money";
import { flattenNavigation, type FlatNavItem } from "@/lib/navigation";
import { cn } from "@/lib/utils";

type TopBarProps = {
  menuOpen: boolean;
  onMenu: () => void;
};

export function TopBar({ menuOpen, onMenu }: TopBarProps) {
  return (
    <header className="flex h-[76px] items-center gap-3 px-4 print:hidden sm:px-6">
      <button
        type="button"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-white text-foreground lg:hidden"
        aria-label="Open menu"
        aria-expanded={menuOpen}
        aria-controls="app-sidebar"
        onClick={onMenu}
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12786c] text-sm font-semibold text-white">
          SP
        </span>
        <p className="truncate text-[15px] font-semibold text-foreground">Starline Property</p>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <ModuleSearch />
        <Notifications />
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f5f7] text-[#5d6b76] hover:bg-[#e7ebef]"
        >
          <Settings className="h-[18px] w-[18px]" />
        </Link>
      </div>
    </header>
  );
}

function ModuleSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const matches = flattenNavigation().filter((item) =>
    item.label.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={rootRef} className="relative hidden sm:block">
      <label className="flex h-10 w-[210px] items-center gap-2 rounded-full bg-[#f3f5f7] px-4 text-[#8b97a3] lg:w-[230px]">
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search"
          aria-label="Search modules"
          aria-expanded={open}
          aria-controls={listId}
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-[#9aa6b2]"
        />
      </label>
      {open && query.trim() ? (
        <div
          id={listId}
          className="absolute right-0 top-[calc(100%+8px)] z-30 w-[260px] overflow-hidden rounded-2xl border border-border bg-white py-2 shadow-[0_16px_40px_rgba(16,36,32,0.12)]"
        >
          {matches.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">No matching module.</p>
          ) : (
            <ul>
              {matches.map((item) => (
                <li key={item.href}>
                  <ModuleResult item={item} onPick={() => setOpen(false)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ModuleResult({ item, onPick }: { item: FlatNavItem; onPick: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onPick}
      className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#f6f8f9]"
    >
      <Icon className="h-4 w-4 text-[#1a9a84]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-[#b0862d]">
        {item.status === "foundation" ? "Home" : item.status === "live" ? "Live" : "Soon"}
      </span>
    </Link>
  );
}

type Notice = {
  id: string;
  kind: "overdue" | "upcoming" | "approval";
  title: string;
  detail: string;
  href: string;
  amount: string;
};

const noticeLabels: Record<Notice["kind"], string> = {
  overdue: "Overdue",
  upcoming: "Upcoming",
  approval: "Approval",
};

function Notifications() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[] | null>(null);
  const [error, setError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    api<{ notifications: Notice[] }>("/api/dashboard/notifications").then((result) => {
      if (!active) return;
      if (!result.ok) setError(result.error);
      else setItems(result.data.notifications);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const count = items?.length ?? 0;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={count ? `Notifications, ${count} open` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "relative flex h-10 w-10 items-center justify-center rounded-full bg-[#f3f5f7] text-[#5d6b76] hover:bg-[#e7ebef]",
          open && "bg-[#e7f6f2] text-[#12786c]",
        )}
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#b42318] px-1 text-[10px] font-semibold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-[calc(100%+8px)] z-30 max-h-96 w-80 overflow-y-auto rounded-2xl border border-border bg-white p-4 shadow-[0_16px_40px_rgba(16,36,32,0.12)]">
          <p className="text-sm font-semibold">Notifications</p>
          {error ? <p className="mt-2 text-sm text-[#b42318]">{error}</p> : null}
          {!items && !error ? <p className="mt-2 text-sm text-muted-foreground">Loading alerts…</p> : null}
          {items && items.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No overdue payments, upcoming deadlines, or pending approvals.</p>
          ) : null}
          {items && items.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {items.map((item) => (
                <li key={item.id} className="border-t border-[#f0f3f5] pt-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[#b0862d]">{noticeLabels[item.kind]}</span>
                    <span className="font-semibold">{formatTaka(item.amount)}</span>
                  </div>
                  <Link href={item.href} onClick={() => setOpen(false)} className="mt-1 block font-medium text-[#12786c] hover:underline">
                    {item.title}
                  </Link>
                  <p className="mt-1 text-[#5c6b76]">{item.detail}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Building2, LogOut, X } from "lucide-react";
import { useAuth } from "@/auth/AuthContext";
import { flattenNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function useIsDesktop() {
  const query = "(min-width: 1024px)";
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(query).matches);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

type SidebarProps = {
  open: boolean;
  onClose: () => void;
};

const items = flattenNavigation();
const mainItems = items.filter((item) => item.href !== "/settings");
const settingsItem = items.find((item) => item.href === "/settings");

export function Sidebar({ open, onClose }: SidebarProps) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const isDesktop = useIsDesktop();
  const shown = isDesktop || open;

  return (
    <>
      <button
        type="button"
        aria-label="Close menu"
        className={cn(
          "fixed inset-0 z-30 bg-[#0c241f]/45 print:hidden lg:hidden",
          open ? "block" : "hidden",
        )}
        onClick={onClose}
      />
      <aside
        id="app-sidebar"
        aria-hidden={!shown}
        inert={!shown ? true : undefined}
        className={cn(
          "flex w-[228px] shrink-0 flex-col bg-sidebar text-sidebar-foreground print:hidden",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-40 max-lg:h-dvh max-lg:shadow-2xl",
          "lg:rounded-l-[28px]",
          shown ? "max-lg:translate-x-0" : "max-lg:-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between gap-3 px-5 pb-2 pt-6">
          <Link href="/" className="flex min-w-0 items-center gap-3" onClick={onClose}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1a9a84] text-white">
              <Building2 className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="truncate text-[15px] font-semibold tracking-tight text-white">
              Starline
            </span>
          </Link>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 hover:bg-white/10 lg:hidden"
            aria-label="Close menu"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav aria-label="Primary" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {mainItems.map((item) => (
              <li key={item.href}>
                <NavLink item={item} active={isItemActive(location, item.href)} onClose={onClose} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-1 px-3 pb-5 pt-2">
          {settingsItem ? (
            <NavLink
              item={settingsItem}
              active={isItemActive(location, settingsItem.href)}
              onClose={onClose}
            />
          ) : null}
          <button
            type="button"
            onClick={() => {
              onClose();
              void logout();
            }}
            className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/78 hover:bg-white/8 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>
    </>
  );
}

function isItemActive(location: string, href: string) {
  if (href === "/") return location === "/";
  return location === href || location.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onClose,
}: {
  item: (typeof items)[number];
  active: boolean;
  onClose: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={onClose}
      className={cn(
        "flex h-11 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium text-white/78 hover:bg-white/8 hover:text-white",
        active && "bg-[#1a9a84] text-white hover:bg-[#1a9a84]",
      )}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  useEffect(() => {
    if (!menuOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [menuOpen]);

  return (
    <div className="min-h-dvh bg-canvas p-3 print:bg-white print:p-0 sm:p-4 lg:p-5">
      <div className="flex min-h-[calc(100dvh-1.5rem)] overflow-hidden rounded-[28px] bg-white shadow-[0_18px_50px_rgba(20,32,28,0.08)] print:block print:min-h-0 print:overflow-visible print:rounded-none print:shadow-none sm:min-h-[calc(100dvh-2rem)] lg:min-h-[calc(100dvh-2.5rem)]">
        <Sidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar menuOpen={menuOpen} onMenu={() => setMenuOpen(true)} />
          <main className="min-h-0 flex-1 overflow-auto px-4 pb-5 print:overflow-visible print:p-0 sm:px-6 sm:pb-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

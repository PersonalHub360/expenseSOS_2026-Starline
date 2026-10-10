import { useEffect, type ReactNode } from "react";

type DialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
};

export function Dialog({ title, onClose, children, wide = false }: DialogProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0c241f]/45 p-3 sm:items-center">
      <button type="button" aria-label="Close dialog" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="inventory-dialog-title"
        className={`relative z-10 max-h-[92dvh] w-full overflow-auto rounded-[22px] bg-white p-5 shadow-[0_24px_60px_rgba(12,36,31,0.2)] sm:p-6 ${wide ? "max-w-3xl" : "max-w-xl"}`}
      >
        <h2 id="inventory-dialog-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export const fieldClass =
  "h-11 w-full rounded-xl border border-[#e6ebef] bg-[#f7f9fa] px-3 text-sm text-foreground outline-none focus:border-[#1a9a84]";

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-[#b42318]">{message}</p>;
}

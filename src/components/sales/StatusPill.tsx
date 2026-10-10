import { statusLabels } from "@/lib/sales";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  open: "bg-[#e8f0ff] text-[#2456b5]",
  converted: "bg-[#e7f6f2] text-[#0f6f62]",
  closed: "bg-[#e7f6f2] text-[#0f6f62]",
  cancelled: "bg-[#fdeceb] text-[#b42318]",
  available: "bg-[#e7f6f2] text-[#0f6f62]",
  reserved: "bg-[#f8f1df] text-[#8a6230]",
  sold: "bg-[#e8f0ff] text-[#2456b5]",
};

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[value] ?? "bg-[#eef2f4] text-[#52616b]")}>
      {statusLabels[value] ?? value}
    </span>
  );
}

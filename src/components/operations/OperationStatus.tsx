import { operationStatusLabels } from "@/lib/operations";
import { cn } from "@/lib/utils";

const tones: Record<string, string> = {
  pending: "bg-[#f8f1df] text-[#8a6230]",
  approved: "bg-[#e7f6f2] text-[#0f6f62]",
  open: "bg-[#e8f0ff] text-[#2456b5]",
  posted: "bg-[#e7f6f2] text-[#0f6f62]",
  rejected: "bg-[#fdeceb] text-[#b42318]",
  void: "bg-[#eef2f4] text-[#52616b]",
  void_pending: "bg-[#f8f1df] text-[#8a6230]",
};

export function OperationStatus({ value }: { value: string }) {
  return (
    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", tones[value] ?? "bg-[#eef2f4] text-[#52616b]")}>
      {operationStatusLabels[value] ?? value}
    </span>
  );
}

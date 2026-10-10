import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[22px] border border-[#eef1f4] bg-card text-card-foreground shadow-[0_10px_28px_rgba(22,40,36,0.04)]",
        className,
      )}
      {...props}
    />
  );
}

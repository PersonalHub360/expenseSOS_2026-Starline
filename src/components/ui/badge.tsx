import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import type { ModuleStatus } from "@/lib/navigation";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]",
  {
    variants: {
      variant: {
        neutral: "bg-secondary text-secondary-foreground",
        soon: "bg-[hsl(36_78%_92%)] text-[hsl(32_64%_28%)]",
        foundation: "bg-accent text-accent-foreground",
        live: "bg-[#e7f6f2] text-[#0f6f62]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

type BadgeProps = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export function statusBadgeVariant(status: ModuleStatus) {
  if (status === "foundation") return "foundation";
  if (status === "live") return "live";
  return "soon";
}

export function statusLabel(status: ModuleStatus) {
  if (status === "foundation") return "Foundation";
  if (status === "live") return "Live";
  return "Coming soon";
}

import type { ReactNode } from "react";
import { Badge, statusBadgeVariant, statusLabel } from "@/components/ui/badge";
import type { ModuleStatus } from "@/lib/navigation";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description: string;
  status?: ModuleStatus;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, status, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {status ? (
            <Badge variant={statusBadgeVariant(status)}>{statusLabel(status)}</Badge>
          ) : null}
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}

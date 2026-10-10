import { useLocation } from "wouter";
import { ComingSoon } from "@/components/ui/coming-soon";
import { PageHeader } from "@/components/ui/page-header";
import { findNavItem } from "@/lib/navigation";
import { NotFoundPage } from "@/pages/NotFoundPage";

export function ComingSoonPage() {
  const [location] = useLocation();
  const item = findNavItem(location);

  if (!item || item.status !== "coming-soon") {
    return <NotFoundPage />;
  }

  return (
    <div>
      <PageHeader
        eyebrow={item.group}
        title={item.label}
        description={item.description}
        status="coming-soon"
      />
      <ComingSoon title={item.label} detail={item.description} />
    </div>
  );
}

import { Link } from "wouter";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";

export function NotFoundPage() {
  return (
    <div>
      <PageHeader
        eyebrow="Starline Property"
        title="Page not found"
        description="That address is not part of the workspace."
      />
      <div className="mt-6">
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

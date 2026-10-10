import { Link } from "wouter";
import { Clock3 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type ComingSoonProps = {
  title: string;
  detail: string;
};

export function ComingSoon({ title, detail }: ComingSoonProps) {
  return (
    <Card className="mt-8 px-6 py-12 text-center sm:px-10">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(36_78%_92%)] text-[hsl(32_64%_28%)]">
        <Clock3 className="h-5 w-5" aria-hidden="true" />
      </div>
      <p className="mt-5 font-display text-xl font-semibold text-foreground">Coming soon</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {title} is not available yet. {detail} This page is only a placeholder in the design
        foundation.
      </p>
      <div className="mt-6">
        <Link href="/" className={buttonVariants({ variant: "secondary" })}>
          Back to dashboard
        </Link>
      </div>
    </Card>
  );
}

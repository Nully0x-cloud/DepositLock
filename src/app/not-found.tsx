import { FileQuestion } from "lucide-react";
import Link from "next/link";
import { Brand } from "@/components/layout/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col bg-cream">
      <div className="border-b border-line">
        <div className="mx-auto flex h-[4.5rem] w-full max-w-[1180px] items-center px-5 sm:px-8 lg:px-10">
          <Brand />
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="max-w-md text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-sand text-forest">
            <FileQuestion aria-hidden className="size-6" strokeWidth={1.75} />
          </span>
          <h1 className="mt-6 font-serif text-[2rem] leading-tight tracking-[-0.02em] text-ink">
            This record could not be found
          </h1>
          <p className="mt-3 text-base leading-relaxed text-muted">
            The tenancy you are looking for may have been archived, or the link
            is out of date.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/app/tenancies"
              className="inline-flex h-11 items-center justify-center rounded-full bg-forest px-6 text-sm font-medium text-cream transition-colors hover:bg-forest-deep"
            >
              My Tenancies
            </Link>
            <Link
              href="/"
              className="inline-flex h-11 items-center justify-center rounded-full border border-line px-6 text-sm font-medium text-ink transition-colors hover:bg-sand"
            >
              Back home
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

import Link from "next/link";
import { WeirwiseMark } from "@/components/ui/weirwise-mark";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-foreground transition-colors select-none">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <WeirwiseMark className="h-12 w-auto" />
        </div>
        
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-sm border border-border bg-muted text-xs font-mono font-semibold text-accent-strong">
            404 — PAGE NOT FOUND
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            We couldn&apos;t find that page
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            The page may have moved or been deleted. Check the address, or head back to your dashboard.
          </p>
        </div>

        <div className="pt-2 flex items-center justify-center gap-3">
          <Link href="/">
            <Button variant="outline" size="sm" className="h-9 px-4 text-xs font-semibold gap-2">
              <Home className="h-4 w-4" /> Home
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="primary" size="sm" className="h-9 px-4 text-xs font-bold gap-2">
              <ArrowLeft className="h-4 w-4" /> Sign In
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

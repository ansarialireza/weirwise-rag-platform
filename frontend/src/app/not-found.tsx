import Link from "next/link";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-6 bg-background text-foreground transition-colors select-none">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <WeirwiseSymbol className="h-12 w-12" />
        </div>
        
        <div className="space-y-2">
          <div className="inline-block px-3 py-1 rounded-full border border-border bg-secondary/50 text-xs font-mono font-semibold text-primary">
            404 — PAGE NOT FOUND
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            Resource Out of Bounds
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            The workspace, assistant, or endpoint you requested does not exist or has been relocated within the ecosystem.
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

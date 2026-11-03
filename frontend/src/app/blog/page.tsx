import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Calendar, Clock, ArrowRight, BookOpen, Tag } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Architectural deep dives, best practices for RAG assistants, and product updates from the Weirwise engineering team.",
  openGraph: {
    title: "Blog",
    description:
      "Architectural deep dives, best practices for RAG assistants, and product updates from the Weirwise engineering team.",
  },
};

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between font-sans transition-colors">
      <SiteHeader />

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 md:py-20">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-secondary/80 px-3.5 py-1 text-xs font-semibold text-foreground mb-4">
            <BookOpen className="h-3.5 w-3.5 text-[#2563FF]" />
            <span>Engineering & Product Blog</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#090A0C] dark:text-foreground">
            Insights & Architecture
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            Deep dives into autonomous RAG, deterministic citation grounding, enterprise vector isolation, and conversational UX.
          </p>
        </div>

        {/* Post Grid */}
        {posts.length === 0 ? (
          <div className="text-center py-16 border border-border rounded-2xl bg-card">
            <p className="text-muted-foreground text-sm">No blog posts published yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group relative rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col justify-between hover:border-[#2563FF]/50 transition-all shadow-xs hover:shadow-md"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
                    {post.category && (
                      <span className="px-2.5 py-0.5 rounded-full bg-[#2563FF]/10 text-[#2563FF] font-semibold text-[11px]">
                        {post.category}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {post.date}
                    </span>
                    {post.readTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {post.readTime}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-[#090A0C] dark:text-foreground group-hover:text-[#2563FF] transition-colors leading-snug">
                    <Link href={`/blog/${post.slug}`}>
                      <span className="absolute inset-0" />
                      {post.title}
                    </Link>
                  </h2>

                  <p className="mt-3 text-sm text-muted-foreground leading-relaxed line-clamp-3">
                    {post.description}
                  </p>
                </div>

                <div className="mt-6 pt-5 border-t border-border/80 flex items-center justify-between">
                  <div className="text-xs">
                    <span className="font-semibold text-foreground block">{post.author}</span>
                    {post.authorRole && (
                      <span className="text-muted-foreground text-[11px]">{post.authorRole}</span>
                    )}
                  </div>

                  <span className="text-xs font-semibold text-[#2563FF] inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Read Article
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      <footer className="w-full border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground mt-16">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <WeirwiseSymbol className="h-5 w-auto" />
            <span className="font-semibold text-foreground text-xs">Weirwise</span>
            <span>&copy; 2026 Weirwise Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 text-xs font-medium">
            <Link href="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link href="/blog" className="text-foreground font-semibold">
              Blog
            </Link>
            <Link href="/login" className="hover:text-foreground transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { SiteHeader } from "@/components/layout/site-header";
import { Calendar, Clock, ArrowRight, BookOpen, Tag } from "lucide-react";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "How Weirwise works, practical guides for teams putting their own knowledge to work, and product updates.",
  openGraph: {
    title: "Blog",
    description:
      "How Weirwise works, practical guides for teams putting their own knowledge to work, and product updates.",
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
            <BookOpen className="h-3.5 w-3.5 text-accent" />
            <span>Engineering & Product Blog</span>
          </div>
          <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            Insights &amp; Architecture
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
            How Weirwise keeps knowledge flowing: retrieval that shows its work, permission-aware routing, and the engineering behind answers you can put your name to.
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
                className="group relative rounded-2xl border border-border bg-card p-6 sm:p-8 flex flex-col justify-between hover:border-accent/50 transition-all shadow-xs hover:shadow-md"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mb-4">
                    {post.category && (
                      <span className="px-2.5 py-0.5 rounded-full bg-accent/10 text-accent font-semibold text-[11px]">
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

                  <h2 className="text-xl sm:text-2xl font-bold text-foreground group-hover:text-accent transition-colors leading-snug">
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

                  <span className="text-xs font-semibold text-accent inline-flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                    Read Article
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* The header carries the mark and the navigation, so this repeats neither. */}
      <footer className="mt-16 border-t border-border/80">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-2 px-4 py-6 text-[11px] text-muted-foreground sm:flex-row sm:px-6">
          <span>&copy; 2026 Weirwise Inc.</span>
          <span>Answers with sources. Knowledge under control.</span>
        </div>
      </footer>
    </div>
  );
}

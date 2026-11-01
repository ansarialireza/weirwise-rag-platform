import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { MDXRemote } from "next-mdx-remote/rsc";
import { getAllPosts, getPostBySlug } from "@/lib/blog";
import { SiteHeader } from "@/components/layout/site-header";
import { WeirwiseSymbol } from "@/components/ui/weirwise-symbol";
import { Calendar, Clock, ArrowLeft, CheckCircle2, Bot, Shield, ChevronRight } from "lucide-react";

interface Props {
  params: { slug: string };
}

export async function generateStaticParams() {
  const posts = getAllPosts();
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = getPostBySlug(params.slug);
  if (!post) {
    return {
      title: "Post Not Found | Weirwise Blog",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";
  const postUrl = `${baseUrl}/blog/${post.meta.slug}`;

  return {
    title: `${post.meta.title} | Weirwise Blog`,
    description: post.meta.description,
    authors: [{ name: post.meta.author }],
    alternates: {
      canonical: postUrl,
    },
    openGraph: {
      type: "article",
      url: postUrl,
      title: post.meta.title,
      description: post.meta.description,
      publishedTime: post.meta.date,
      authors: [post.meta.author],
      siteName: "Weirwise",
      images: [
        {
          url: "/weirwise-horizontal.svg",
          width: 1200,
          height: 630,
          alt: post.meta.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.meta.title,
      description: post.meta.description,
      images: ["/weirwise-horizontal.svg"],
    },
  };
}

const mdxComponents = {
  h1: (props: any) => (
    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#090A0C] dark:text-foreground mt-8 mb-4" {...props} />
  ),
  h2: (props: any) => (
    <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#090A0C] dark:text-foreground mt-8 mb-3" {...props} />
  ),
  h3: (props: any) => (
    <h3 className="text-lg sm:text-xl font-bold tracking-tight text-[#090A0C] dark:text-foreground mt-6 mb-2" {...props} />
  ),
  p: (props: any) => (
    <p className="text-base text-muted-foreground leading-relaxed mb-4" {...props} />
  ),
  ul: (props: any) => (
    <ul className="list-disc list-inside space-y-2 mb-4 text-muted-foreground text-base" {...props} />
  ),
  ol: (props: any) => (
    <ol className="list-decimal list-inside space-y-2 mb-4 text-muted-foreground text-base" {...props} />
  ),
  li: (props: any) => <li className="leading-relaxed" {...props} />,
  strong: (props: any) => <strong className="font-semibold text-foreground" {...props} />,
  blockquote: (props: any) => (
    <blockquote className="border-l-4 border-[#2563FF] pl-4 italic text-muted-foreground my-4 bg-secondary/30 py-2 rounded-r" {...props} />
  ),
  pre: (props: any) => (
    <pre className="p-4 rounded-xl bg-muted border border-border overflow-x-auto text-xs sm:text-sm font-mono my-6 text-foreground" {...props} />
  ),
  code: (props: any) => (
    <code className="font-mono text-xs bg-secondary/80 px-1.5 py-0.5 rounded text-foreground border border-border/60" {...props} />
  ),
};

export default function BlogPostPage({ params }: Props) {
  const post = getPostBySlug(params.slug);

  if (!post) {
    notFound();
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://dev.weirwise.com";
  const postUrl = `${baseUrl}/blog/${post.meta.slug}`;

  // Article JSON-LD Schema
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.meta.title,
    description: post.meta.description,
    author: {
      "@type": "Person",
      name: post.meta.author,
    },
    publisher: {
      "@type": "Organization",
      name: "Weirwise Inc.",
      logo: {
        "@type": "ImageObject",
        url: `${baseUrl}/weirwise-horizontal.svg`,
      },
    },
    datePublished: post.meta.date,
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": postUrl,
    },
    image: `${baseUrl}/weirwise-horizontal.svg`,
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col justify-between font-sans transition-colors">
      <SiteHeader />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14 md:py-16">
        {/* Breadcrumb & Navigation */}
        <div className="mb-8">
          <Link
            href="/blog"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-[#2563FF] transition-colors group mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to all insights</span>
          </Link>

          <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground mb-4">
            {post.meta.category && (
              <span className="px-2.5 py-0.5 rounded-full bg-[#2563FF]/10 text-[#2563FF] font-semibold text-[11px]">
                {post.meta.category}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {post.meta.date}
            </span>
            {post.meta.readTime && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {post.meta.readTime}
              </span>
            )}
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-[#090A0C] dark:text-foreground leading-tight">
            {post.meta.title}
          </h1>

          <div className="mt-6 flex items-center justify-between border-y border-border/80 py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-secondary border border-border flex items-center justify-center font-bold text-xs text-foreground">
                WW
              </div>
              <div>
                <span className="text-sm font-bold text-foreground block">{post.meta.author}</span>
                {post.meta.authorRole && (
                  <span className="text-xs text-muted-foreground">{post.meta.authorRole}</span>
                )}
              </div>
            </div>

            {post.meta.tags && post.meta.tags.length > 0 && (
              <div className="hidden sm:flex items-center gap-1.5">
                {post.meta.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[11px] font-mono px-2 py-0.5 rounded bg-secondary/80 text-muted-foreground border border-border/60"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MDX Content */}
        <article className="prose prose-neutral dark:prose-invert max-w-none">
          <MDXRemote source={post.content} components={mdxComponents} />
        </article>

        {/* Bottom Call to Action Card */}
        <div className="mt-16 rounded-2xl border border-border bg-card p-6 sm:p-8 text-center relative overflow-hidden shadow-xs">
          <h3 className="text-xl font-extrabold text-[#090A0C] dark:text-foreground mb-2">
            Experience Grounded AI for Your Business
          </h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mb-6">
            Build, test, and publish zero-hallucination assistants backed by isolated vector stores.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#090A0C] text-[#CCFF00] dark:bg-primary dark:text-primary-foreground px-6 py-3 text-sm font-bold shadow-md hover:bg-[#14161C] active:scale-[0.98] transition-all"
          >
            <span>Start Free Trial</span>
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </main>

      <footer className="w-full border-t border-border/80 py-6 px-4 sm:px-6 text-xs text-muted-foreground">
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
            <Link href="/blog" className="hover:text-foreground transition-colors">
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

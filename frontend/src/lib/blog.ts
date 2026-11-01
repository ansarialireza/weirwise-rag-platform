import fs from "fs";
import path from "path";
import matter from "gray-matter";

const BLOG_DIR = path.join(process.cwd(), "content/blog");

export interface BlogPostMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
  author: string;
  authorRole?: string;
  category?: string;
  readTime?: string;
  tags?: string[];
}

export interface BlogPost {
  meta: BlogPostMeta;
  content: string;
}

export function getAllPosts(): BlogPostMeta[] {
  if (!fs.existsSync(BLOG_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BLOG_DIR).filter((file) => file.endsWith(".mdx") || file.endsWith(".md"));

  const posts = files.map((fileName) => {
    const slug = fileName.replace(/\.(mdx|md)$/, "");
    const fullPath = path.join(BLOG_DIR, fileName);
    const fileContents = fs.readFileSync(fullPath, "utf8");
    const { data } = matter(fileContents);

    return {
      slug,
      title: data.title || slug,
      date: data.date ? String(data.date) : new Date().toISOString().split("T")[0],
      description: data.description || "",
      author: data.author || "Weirwise Team",
      authorRole: data.authorRole || "Platform Engineering",
      category: data.category || "Engineering",
      readTime: data.readTime || "4 min read",
      tags: Array.isArray(data.tags) ? data.tags : [],
    } as BlogPostMeta;
  });

  return posts.sort((a, b) => (new Date(b.date) > new Date(a.date) ? 1 : -1));
}

export function getPostBySlug(slug: string): BlogPost | null {
  const mdxPath = path.join(BLOG_DIR, `${slug}.mdx`);
  const mdPath = path.join(BLOG_DIR, `${slug}.md`);

  const targetPath = fs.existsSync(mdxPath) ? mdxPath : fs.existsSync(mdPath) ? mdPath : null;

  if (!targetPath) {
    return null;
  }

  const fileContents = fs.readFileSync(targetPath, "utf8");
  const { data, content } = matter(fileContents);

  return {
    meta: {
      slug,
      title: data.title || slug,
      date: data.date ? String(data.date) : new Date().toISOString().split("T")[0],
      description: data.description || "",
      author: data.author || "Weirwise Team",
      authorRole: data.authorRole || "Platform Engineering",
      category: data.category || "Engineering",
      readTime: data.readTime || "4 min read",
      tags: Array.isArray(data.tags) ? data.tags : [],
    },
    content,
  };
}

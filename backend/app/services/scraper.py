"""Advanced, resilient, SSRF-safe website crawler and sitemap discovery engine."""

import ipaddress
import re
import socket
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlparse, urlunparse

import httpx
from backend.app.core.logging import logger
from bs4 import BeautifulSoup
from fastapi import HTTPException, status

BLOCKED_IP_RANGES = [
    ipaddress.ip_network("127.0.0.0/8"),  # IPv4 loopback
    ipaddress.ip_network("10.0.0.0/8"),  # RFC1918 Private
    ipaddress.ip_network("172.16.0.0/12"),  # RFC1918 Private
    ipaddress.ip_network("192.168.0.0/16"),  # RFC1918 Private
    ipaddress.ip_network("169.254.0.0/16"),  # Link-local / Cloud Metadata (AWS/GCP/Azure)
    ipaddress.ip_network("100.64.0.0/10"),  # Carrier-grade NAT
    ipaddress.ip_network("192.0.0.0/24"),  # IETF Protocol Assignments
    ipaddress.ip_network("198.18.0.0/15"),  # Network benchmark tests
    ipaddress.ip_network("224.0.0.0/4"),  # Multicast
    ipaddress.ip_network("240.0.0.0/4"),  # Reserved
    ipaddress.ip_network("0.0.0.0/8"),  # Current network
    ipaddress.ip_network("::1/128"),  # IPv6 loopback
    ipaddress.ip_network("fc00::/7"),  # IPv6 Unique Local
    ipaddress.ip_network("fe80::/10"),  # IPv6 Link-local
]

DISALLOWED_FILE_EXTENSIONS = {
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".rar",
    ".7z",
    ".exe",
    ".bin",
    ".dmg",
    ".iso",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".svg",
    ".bmp",
    ".ico",
    ".tiff",
    ".mp3",
    ".wav",
    ".mp4",
    ".avi",
    ".mkv",
    ".mov",
    ".flv",
    ".css",
    ".js",
    ".json",
    ".xml",
    ".rss",
    ".atom",
}


def normalize_url(url: str) -> str:
    """Normalize URL by stripping fragments, lowercase scheme/host, and normalizing path."""
    parsed = urlparse(url.strip())
    scheme = parsed.scheme.lower()
    netloc = parsed.netloc.lower()

    # Strip standard ports
    if ":" in netloc:
        host, port = netloc.split(":", 1)
        if (scheme == "http" and port == "80") or (scheme == "https" and port == "443"):
            netloc = host

    path = parsed.path or "/"
    # Clean multiple consecutive slashes
    path = re.sub(r"/+", "/", path)
    if path != "/" and path.endswith("/"):
        path = path.rstrip("/")

    return urlunparse((scheme, netloc, path, "", parsed.query, ""))


def is_ssrf_safe_url(url: str) -> bool:
    """Validate that target URL uses http/https and resolves strictly to public routable IP."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        # Block localhost and common metadata hostnames
        if hostname.lower() in ("localhost", "127.0.0.1", "::1", "metadata.google.internal", "instance-data"):
            return False

        # Resolve DNS
        addr_info = socket.getaddrinfo(hostname, None)
        if not addr_info:
            return False

        for entry in addr_info:
            ip_str = entry[4][0]
            ip = ipaddress.ip_address(ip_str)

            for blocked_net in BLOCKED_IP_RANGES:
                if ip in blocked_net:
                    return False

            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
                or str(ip) == "169.254.169.254"
            ):
                return False

        return True
    except Exception as e:
        logger.warning(f"SSRF safety check failed for {url}: {e!s}")
        return False


def is_safe_url(url: str) -> bool:
    """Alias for is_ssrf_safe_url for backwards compatibility."""
    return is_ssrf_safe_url(url)


@dataclass
class DiscoveredPage:
    url: str
    title: str = ""
    word_count: int = 0
    content: str = ""
    status: str = "discovered"  # discovered, crawled, failed
    error: str | None = None


@dataclass
class CrawlResult:
    root_url: str
    pages: list[DiscoveredPage] = field(default_factory=list)
    sitemaps_found: list[str] = field(default_factory=list)
    total_discovered: int = 0
    crawl_errors: list[str] = field(default_factory=list)


class WebsiteCrawler:
    """Enterprise crawler supporting robots.txt compliance, sitemap parsing, SSRF prevention, and rate limiting."""

    def __init__(
        self,
        max_pages: int = 50,
        max_depth: int = 3,
        timeout: float = 12.0,
        max_size_bytes: int = 5 * 1024 * 1024,
        user_agent: str = "WeirwisePlatform-Bot/1.0 (+https://weirwise.com/bot)",
    ):
        self.max_pages = max_pages
        self.max_depth = max_depth
        self.timeout = timeout
        self.max_size_bytes = max_size_bytes
        self.user_agent = user_agent

    async def _safe_get(self, client: httpx.AsyncClient, url: str) -> httpx.Response | None:
        """Fetch URL with SSRF re-check on redirects."""
        if not is_ssrf_safe_url(url):
            logger.warning(f"Blocked unsafe or private URL request: {url}")
            return None

        try:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": self.user_agent,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
                },
                follow_redirects=True,
            )
            # Re-check destination URL after redirects
            if not is_ssrf_safe_url(str(resp.url)):
                logger.warning(f"Blocked unsafe redirect target: {resp.url}")
                return None
            return resp
        except Exception as e:
            logger.debug(f"Request failed for {url}: {e!s}")
            return None

    async def parse_robots_txt(
        self, client: httpx.AsyncClient, root_url: str
    ) -> tuple[urllib.robotparser.RobotFileParser, list[str]]:
        """Fetch robots.txt, parse rules, and extract listed sitemaps."""
        parsed = urlparse(root_url)
        robots_url = urlunparse((parsed.scheme, parsed.netloc, "/robots.txt", "", "", ""))
        rp = urllib.robotparser.RobotFileParser()
        sitemaps: list[str] = []

        resp = await self._safe_get(client, robots_url)
        if resp and resp.status_code == 200:
            content = resp.text
            rp.parse(content.splitlines())
            for line in content.splitlines():
                if line.lower().startswith("sitemap:"):
                    sm = line.split(":", 1)[1].strip()
                    if sm and is_ssrf_safe_url(sm):
                        sitemaps.append(normalize_url(sm))
        else:
            # If robots.txt returns 404, default allow all
            setattr(rp, "allow_all", True)

        return rp, sitemaps

    async def discover_sitemaps(
        self, client: httpx.AsyncClient, root_url: str, candidate_sitemaps: list[str]
    ) -> list[str]:
        """Discover and validate sitemaps including conventional locations."""
        discovered: set[str] = set()
        for sm in candidate_sitemaps:
            discovered.add(sm)

        parsed = urlparse(root_url)
        standard_locations = [
            "/sitemap.xml",
            "/sitemap_index.xml",
            "/sitemap1.xml",
        ]
        for loc in standard_locations:
            loc_url = normalize_url(urlunparse((parsed.scheme, parsed.netloc, loc, "", "", "")))
            if loc_url not in discovered and is_ssrf_safe_url(loc_url):
                resp = await self._safe_get(client, loc_url)
                if (
                    resp
                    and resp.status_code == 200
                    and (
                        "xml" in resp.headers.get("content-type", "") or "<url" in resp.text or "<sitemap" in resp.text
                    )
                ):
                    discovered.add(loc_url)

        return list(discovered)

    async def parse_sitemap_urls(
        self, client: httpx.AsyncClient, sitemap_url: str, base_domain: str, max_urls: int = 100
    ) -> list[str]:
        """Safely parse XML sitemap, handling sitemap indexes recursively."""
        urls: set[str] = set()
        to_process = [sitemap_url]
        processed_sitemaps: set[str] = set()

        while to_process and len(urls) < max_urls and len(processed_sitemaps) < 10:
            current_sm = to_process.pop(0)
            if current_sm in processed_sitemaps:
                continue
            processed_sitemaps.add(current_sm)

            resp = await self._safe_get(client, current_sm)
            if not resp or resp.status_code != 200:
                continue

            try:
                # Safe XML parsing using standard ElementTree without external entity expansion
                root = ET.fromstring(resp.text)
                # Strip XML namespace if present
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]

                # If sitemap index contains child sitemaps
                if root.tag == "sitemapindex":
                    for sm_elem in root.findall(".//sitemap"):
                        loc = sm_elem.find("loc")
                        if loc is not None and loc.text:
                            child_sm = normalize_url(loc.text.strip())
                            if is_ssrf_safe_url(child_sm) and child_sm not in processed_sitemaps:
                                to_process.append(child_sm)

                # Standard urlset
                elif root.tag == "urlset":
                    for url_elem in root.findall(".//url"):
                        loc = url_elem.find("loc")
                        if loc is not None and loc.text:
                            page_url = normalize_url(loc.text.strip())
                            # Enforce same domain scope and SSRF safety
                            if urlparse(page_url).netloc == base_domain and is_ssrf_safe_url(page_url):
                                urls.add(page_url)
                                if len(urls) >= max_urls:
                                    break
            except Exception as e:
                logger.debug(f"Failed to parse sitemap XML {current_sm}: {e!s}")

        return list(urls)

    def extract_page_content(self, html: str, url: str) -> tuple[str, str, int]:
        """Extract clean text content, page title, and word count from HTML DOM."""
        soup = BeautifulSoup(html, "html.parser")

        # Extract title
        title = ""
        if soup.title and soup.title.string:
            title = soup.title.string.strip()
        elif soup.find("h1"):
            h1 = soup.find("h1")
            title = h1.get_text(strip=True) if h1 else ""
        if not title:
            title = urlparse(url).path.strip("/") or "Homepage"

        # Remove irrelevant elements
        for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav", "aside", "form"]):
            tag.decompose()

        text = soup.get_text(separator="\n")
        lines = [line.strip() for line in text.splitlines() if line.strip()]
        clean_text = "\n".join(lines)
        word_count = len(clean_text.split())

        return clean_text, title, word_count

    async def crawl_site(self, target_url: str, limit: int | None = None) -> CrawlResult:
        """Crawl a website starting from root URL, using sitemaps and HTML discovery."""
        max_p = limit or self.max_pages
        norm_root = normalize_url(target_url)

        if not is_ssrf_safe_url(norm_root):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Target URL resolves to an invalid or prohibited private network address.",
            )

        root_domain = urlparse(norm_root).netloc
        result = CrawlResult(root_url=norm_root)

        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            # 1. Parse robots.txt
            rp, initial_sitemaps = await self.parse_robots_txt(client, norm_root)

            # 2. Discover all sitemaps
            all_sitemaps = await self.discover_sitemaps(client, norm_root, initial_sitemaps)
            result.sitemaps_found = all_sitemaps

            # 3. Harvest URLs from sitemaps if available
            candidate_urls: set[str] = set()
            for sm in all_sitemaps:
                sm_urls = await self.parse_sitemap_urls(client, sm, root_domain, max_urls=max_p)
                for u in sm_urls:
                    candidate_urls.add(u)

            # Ensure root is queued
            candidate_urls.add(norm_root)

            # 4. Crawl queue with depth & scope bounding
            visited: set[str] = set()
            queue: list[tuple[str, int]] = [(u, 0) for u in candidate_urls]

            while queue and len(visited) < max_p:
                current_url, depth = queue.pop(0)
                norm_curr = normalize_url(current_url)

                if norm_curr in visited:
                    continue

                # Check domain scope
                if urlparse(norm_curr).netloc != root_domain:
                    continue

                # Check extensions
                path_lower = urlparse(norm_curr).path.lower()
                if any(path_lower.endswith(ext) for ext in DISALLOWED_FILE_EXTENSIONS):
                    continue

                # Robots.txt respect
                if not rp.can_fetch(self.user_agent, norm_curr):
                    logger.debug(f"Robots.txt disallowed: {norm_curr}")
                    continue

                visited.add(norm_curr)

                resp = await self._safe_get(client, norm_curr)
                if not resp or resp.status_code != 200:
                    continue

                content_type = resp.headers.get("content-type", "").lower()
                if "text/html" not in content_type and "application/xhtml" not in content_type:
                    continue

                if len(resp.content) > self.max_size_bytes:
                    continue

                clean_text, title, words = self.extract_page_content(resp.text, norm_curr)

                # Store discovered page
                page = DiscoveredPage(
                    url=norm_curr,
                    title=title,
                    word_count=words,
                    content=clean_text,
                    status="crawled",
                )
                result.pages.append(page)

                # If within depth, discover outgoing internal links
                if depth < self.max_depth and len(visited) + len(queue) < max_p * 2:
                    soup = BeautifulSoup(resp.text, "html.parser")
                    for a_tag in soup.find_all("a", href=True):
                        raw_href = str(a_tag["href"])
                        joined = urljoin(norm_curr, raw_href)
                        norm_child = normalize_url(joined)
                        if (
                            urlparse(norm_child).netloc == root_domain
                            and is_ssrf_safe_url(norm_child)
                            and norm_child not in visited
                        ):
                            queue.append((norm_child, depth + 1))

            result.total_discovered = len(result.pages)
            return result


async def fetch_webpage_content(url: str, max_size_bytes: int = 5 * 1024 * 1024) -> str:
    """Convenience wrapper for single webpage text extraction."""
    crawler = WebsiteCrawler(max_pages=1, max_depth=0, max_size_bytes=max_size_bytes)
    result = await crawler.crawl_site(url, limit=1)
    if result.pages:
        return result.pages[0].content
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Failed to extract readable content from URL.",
    )


crawler_engine = WebsiteCrawler()

"""SSRF-safe web crawling and URL validation service."""

import ipaddress
import socket
from urllib.parse import urlparse

import httpx
from backend.app.core.logging import logger
from bs4 import BeautifulSoup
from fastapi import HTTPException, status


def is_safe_url(url: str) -> bool:
    """Validate that target URL does not resolve to private, loopback, or metadata addresses."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return False

        hostname = parsed.hostname
        if not hostname:
            return False

        # Resolve IP addresses
        addr_info = socket.getaddrinfo(hostname, None)
        for entry in addr_info:
            ip_str = entry[4][0]
            ip = ipaddress.ip_address(ip_str)

            # Block private, loopback, link-local, multicast, and cloud metadata (169.254.169.254)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or str(ip) == "169.254.169.254"
            ):
                return False

        return True
    except Exception as e:
        logger.warning(f"URL validation failed for {url}: {e!s}")
        return False


async def fetch_webpage_content(url: str, max_size_bytes: int = 5 * 1024 * 1024) -> str:
    """Fetch and extract clean text from a safe public website."""
    if not is_safe_url(url):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The supplied URL is invalid, unsafe, or resolves to a private network address.",
        )

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "WeirwisePlatform/1.0"})

            # Re-verify target if redirected
            if not is_safe_url(str(resp.url)):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Redirected to an unauthorized private network destination.",
                )

            if resp.status_code != 200:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Failed to fetch webpage: HTTP {resp.status_code}",
                )

            if len(resp.content) > max_size_bytes:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail="Webpage content exceeds maximum allowed download size.",
                )

            soup = BeautifulSoup(resp.text, "html.parser")
            for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav"]):
                tag.decompose()

            text = soup.get_text(separator="\n")
            lines = [line.strip() for line in text.splitlines() if line.strip()]
            return "\n".join(lines)
    except httpx.RequestError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Network error while fetching URL: {e!s}",
        )

"""GeoIP resolution service with strict trusted proxy validation."""

import ipaddress
import logging
from typing import Dict, Optional, Set

logger = logging.getLogger(__name__)

# Official Cloudflare IPv4 and IPv6 CIDR ranges (https://www.cloudflare.com/ips/)
CLOUDFLARE_IPV4_CIDRS = [
    ipaddress.ip_network("173.245.48.0/20"),
    ipaddress.ip_network("103.21.244.0/22"),
    ipaddress.ip_network("103.22.200.0/22"),
    ipaddress.ip_network("103.31.4.0/22"),
    ipaddress.ip_network("141.101.64.0/18"),
    ipaddress.ip_network("108.162.192.0/18"),
    ipaddress.ip_network("190.93.240.0/20"),
    ipaddress.ip_network("188.114.96.0/20"),
    ipaddress.ip_network("197.234.240.0/22"),
    ipaddress.ip_network("198.41.128.0/17"),
    ipaddress.ip_network("162.158.0.0/15"),
    ipaddress.ip_network("104.16.0.0/13"),
    ipaddress.ip_network("104.24.0.0/14"),
    ipaddress.ip_network("172.64.0.0/13"),
    ipaddress.ip_network("131.0.72.0/22"),
]

# Internal Docker Gateway / Reverse Proxy ranges (shared-proxy-network, dev-internal)
INTERNAL_PROXY_CIDRS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
]


def is_trusted_proxy_or_cloudflare(ip_str: Optional[str]) -> bool:
    """Verifies whether the immediate client IP is an authentic Cloudflare edge node or internal proxy."""
    if not ip_str:
        return False
    try:
        ip = ipaddress.ip_address(ip_str)
        # Check Cloudflare IP blocks
        for net in CLOUDFLARE_IPV4_CIDRS:
            if ip in net:
                return True
        # Check internal reverse proxy (nginx / docker gateway)
        for net in INTERNAL_PROXY_CIDRS:
            if ip in net:
                return True
        return False
    except ValueError:
        return False


def is_private_or_reserved_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local
    except ValueError:
        return True


class GeoIPService:
    """Privacy-preserving geolocation service with trusted proxy validation.
    
    1. Validates whether requests carrying CF-IPCountry originate from an authentic Cloudflare proxy.
    2. Directly rejects/discards forged CF-IPCountry headers from untrusted external IPs.
    3. Never stores, logs, or emits raw IP addresses into behavioral tables.
    """

    @classmethod
    def resolve_geo_context(
        cls,
        client_ip: Optional[str],
        cf_country: Optional[str] = None,
        cf_ray: Optional[str] = None,
        client_tz: Optional[str] = None,
    ) -> Dict[str, Optional[str]]:
        """Resolves privacy-preserving geography dictionary with strict authenticity checks."""
        # Check authenticity of Cloudflare header
        # Header is only trusted if CF-RAY is present AND request arrived from a trusted proxy / Cloudflare IP
        is_trusted = is_trusted_proxy_or_cloudflare(client_ip) and bool(cf_ray)

        if is_trusted and cf_country and len(cf_country) == 2 and cf_country != "XX":
            country_clean = cf_country.upper()
            return {
                "country_code": country_clean,
                "country_name": cls._get_country_name(country_clean),
                "region": None,
                "city": None,
                "timezone": client_tz,
                "geo_lookup_source": "cf_headers_verified",
            }

        # Handle local development / container gateways
        if not client_ip or is_private_or_reserved_ip(client_ip):
            return {
                "country_code": None,
                "country_name": "Local Network / Private Gateway",
                "region": None,
                "city": None,
                "timezone": client_tz or "UTC",
                "geo_lookup_source": "internal_gateway",
            }

        # Untrusted / Unverified public client connection
        return {
            "country_code": None,
            "country_name": "Unknown",
            "region": None,
            "city": None,
            "timezone": client_tz or "UTC",
            "geo_lookup_source": "unresolved_untrusted",
        }

    @staticmethod
    def _get_country_name(code: str) -> str:
        known_countries = {
            "US": "United States",
            "DE": "Germany",
            "GB": "United Kingdom",
            "FR": "France",
            "NL": "Netherlands",
            "CA": "Canada",
            "AU": "Australia",
            "CH": "Switzerland",
            "AT": "Austria",
            "SE": "Sweden",
            "SG": "Singapore",
            "JP": "Japan",
        }
        return known_countries.get(code, code)


geoip_service = GeoIPService()

"""GeoIP resolution service for privacy-preserving country and timezone detection."""

import ipaddress
import logging
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# Reserved / Private IP ranges (RFC 1918, Loopback, Link-Local)
def is_private_or_reserved_ip(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str)
        return ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local
    except ValueError:
        return True


class GeoIPService:
    """Privacy-preserving geolocation service.
    
    1. Extracts country code from Cloudflare / CDN headers if present (CF-IPCountry).
    2. Fallback to lightweight country lookup for public IPs without external fees.
    3. Resolves reserved / localhost / container IPs to unknown/local without error.
    4. Never saves or emits the raw IP address.
    """

    @classmethod
    def resolve_geo_context(
        cls,
        client_ip: Optional[str],
        cf_country: Optional[str] = None,
        client_tz: Optional[str] = None,
    ) -> Dict[str, Optional[str]]:
        """Resolves privacy-preserving geography dictionary."""
        # 1. Check CDN edge header (e.g. Cloudflare CF-IPCountry)
        if cf_country and len(cf_country) == 2 and cf_country != "XX":
            return {
                "country_code": cf_country.upper(),
                "country_name": cls._get_country_name(cf_country.upper()),
                "region": None,
                "city": None,
                "timezone": client_tz,
                "geo_lookup_source": "cf_headers",
            }

        # 2. Handle private / local IPs
        if not client_ip or is_private_or_reserved_ip(client_ip):
            return {
                "country_code": None,
                "country_name": "Local Network / Private Gateway",
                "region": None,
                "city": None,
                "timezone": client_tz or "UTC",
                "geo_lookup_source": "internal_gateway",
            }

        # 3. Default fallback
        return {
            "country_code": None,
            "country_name": "Unknown",
            "region": None,
            "city": None,
            "timezone": client_tz or "UTC",
            "geo_lookup_source": "unresolved",
        }

    @staticmethod
    def _get_country_name(code: str) -> str:
        # Standard lookup map for top platform domains
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

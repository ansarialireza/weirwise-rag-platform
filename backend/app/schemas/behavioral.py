"""Pydantic v2 schemas for Weirwise Behavioral Intelligence ingestion and querying."""

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


# Common Regex Patterns
COUNTRY_CODE_REGEX = re.compile(r"^[A-Z]{2}$")
EVENT_NAME_REGEX = re.compile(r"^[a-z0-9_]+(\.[a-z0-9_]+)+$")  # e.g. "workflow.funnel.started"


class DeviceContextSchema(BaseModel):
    """Device, browser, operating system, and screen geometry metadata."""
    model_config = ConfigDict(extra="ignore")

    device_category: Literal["desktop", "laptop", "tablet", "mobile", "unknown"] = Field(
        default="unknown",
        description="Physical device form factor",
    )
    operating_system: Optional[str] = Field(None, max_length=64)
    os_version: Optional[str] = Field(None, max_length=32)
    browser: Optional[str] = Field(None, max_length=64)
    browser_version: Optional[str] = Field(None, max_length=32)
    screen_width: Optional[int] = Field(None, ge=1, le=10000)
    screen_height: Optional[int] = Field(None, ge=1, le=10000)
    viewport_width: Optional[int] = Field(None, ge=1, le=10000)
    viewport_height: Optional[int] = Field(None, ge=1, le=10000)
    device_pixel_ratio: Optional[str] = Field(None, max_length=16)
    user_agent_normalized: Optional[str] = Field(None, max_length=255)
    access_environment: Literal["web_app", "pwa", "embedded_widget", "unknown"] = Field(
        default="web_app",
        description="Client execution environment",
    )


class GeographicContextSchema(BaseModel):
    """Privacy-preserving client/server geographic context without raw IP persistence."""
    model_config = ConfigDict(extra="ignore")

    country_code: Optional[str] = Field(None, min_length=2, max_length=2)
    country_name: Optional[str] = Field(None, max_length=100)
    region: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    timezone: Optional[str] = Field(None, max_length=50)

    @field_validator("country_code")
    @classmethod
    def validate_country_code(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v_upper = v.upper()
            if not COUNTRY_CODE_REGEX.match(v_upper):
                raise ValueError("Country code must be a valid ISO 3166-1 alpha-2 uppercase string.")
            return v_upper
        return None


class BehavioralEventItem(BaseModel):
    """Normalized atomic interaction event."""
    model_config = ConfigDict(extra="forbid")

    event_id: uuid.UUID = Field(..., description="Unique client-generated event UUID (idempotency key)")
    category: Literal["navigation", "feature", "action", "workflow", "friction", "error"] = Field(
        ..., description="Functional event domain"
    )
    event_name: str = Field(
        ...,
        min_length=3,
        max_length=64,
        description="Dot-notated event name e.g. 'assistant.builder.saved'",
    )
    component_id: Optional[str] = Field(None, max_length=128, description="Target UI semantic element identifier")
    route: str = Field(..., min_length=1, max_length=255, description="Active application route")
    referrer_route: Optional[str] = Field(None, max_length=255, description="Previous route before navigation")
    duration_ms: Optional[int] = Field(None, ge=0, le=86400000, description="Dwell or step duration in milliseconds")
    timestamp: datetime = Field(..., description="Client event timestamp in ISO 8601 UTC")
    properties: Dict[str, Any] = Field(default_factory=dict, description="Validated event-specific metadata")
    schema_version: str = Field(default="1.0", max_length=16)

    @field_validator("event_name")
    @classmethod
    def validate_event_name_syntax(cls, v: str) -> str:
        if not EVENT_NAME_REGEX.match(v):
            raise ValueError(f"event_name '{v}' must be dot-notated alphanumeric string, e.g. 'domain.object.action'")
        return v

    @field_validator("properties")
    @classmethod
    def validate_properties_size_and_content(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        # Enforce property count limit
        if len(v) > 50:
            raise ValueError("properties dictionary cannot exceed 50 keys")
        
        # Guard against sensitive attributes
        banned_keys = {"password", "secret", "token", "auth", "credit_card", "ssn", "cvv", "key"}
        for k in v.keys():
            if k.lower() in banned_keys:
                raise ValueError(f"Property key '{k}' contains prohibited sensitive data keyword")
        return v


class BehavioralBatchIngestionRequest(BaseModel):
    """Batch ingestion request payload containing up to 100 events for a single session."""
    model_config = ConfigDict(extra="ignore")

    session_id: str = Field(..., min_length=8, max_length=128, description="Unique session token or UUID")
    workspace_id: Optional[uuid.UUID] = Field(None, description="Active workspace context UUID")
    device_context: Optional[DeviceContextSchema] = Field(
        default_factory=DeviceContextSchema,
        description="Client device and browser properties",
    )
    geographic_context: Optional[GeographicContextSchema] = Field(
        default_factory=GeographicContextSchema,
        description="Optional client-supplied timezone and geographic hints",
    )
    events: List[BehavioralEventItem] = Field(
        ...,
        min_length=1,
        max_length=100,
        description="Bounded batch of atomic interaction events (max 100)",
    )


class IngestionResponse(BaseModel):
    """Immediate acknowledgement returned to client."""
    status: str = "accepted"
    session_id: str
    events_queued: int
    ingested_at: datetime

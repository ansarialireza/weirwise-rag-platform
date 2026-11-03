"""Behavioral Intelligence database models: events, sessions, profiles, and insights."""

import enum
import uuid

from backend.app.db.base import GUID, Base, CompatibleJSON, utc_now
from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import relationship


class EventCategory(str, enum.Enum):
    NAVIGATION = "navigation"
    FEATURE = "feature"
    ACTION = "action"
    WORKFLOW = "workflow"
    FRICTION = "friction"
    ERROR = "error"


class DeviceCategory(str, enum.Enum):
    DESKTOP = "desktop"
    LAPTOP = "laptop"
    TABLET = "tablet"
    MOBILE = "mobile"
    UNKNOWN = "unknown"


class AccessEnvironment(str, enum.Enum):
    WEB_APP = "web_app"
    PWA = "pwa"
    EMBEDDED_WIDGET = "embedded_widget"
    UNKNOWN = "unknown"


class UserBehavioralSession(Base):
    """Stores session lifecycle, device intelligence, and resolved geographic context."""

    __tablename__ = "user_behavioral_sessions"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    session_id = Column(String(128), unique=True, nullable=False, index=True)
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)

    # Geographic Context (Privacy-Preserving, IP NOT stored)
    country_code = Column(String(2), nullable=True, index=True)  # ISO 3166-1 alpha-2, e.g. "DE", "US"
    country_name = Column(String(100), nullable=True)  # e.g. "Germany", "United States"
    region = Column(String(100), nullable=True)  # e.g. "Bavaria", "California"
    city = Column(String(100), nullable=True)  # e.g. "Munich", "San Francisco"
    timezone = Column(String(50), nullable=True)  # e.g. "Europe/Berlin", "America/New_York"
    geo_lookup_source = Column(String(50), nullable=True)  # e.g. "geoip_db", "cf_headers", "unknown"

    # Device & Environment Context
    device_category = Column(String(32), default=DeviceCategory.UNKNOWN.value, nullable=False, index=True)
    operating_system = Column(String(64), nullable=True)  # e.g. "Windows", "macOS", "Linux", "iOS", "Android"
    os_version = Column(String(32), nullable=True)  # e.g. "11", "14.2"
    browser = Column(String(64), nullable=True)  # e.g. "Chrome", "Firefox", "Safari", "Edge"
    browser_version = Column(String(32), nullable=True)  # e.g. "122.0.0.0"
    screen_width = Column(Integer, nullable=True)
    screen_height = Column(Integer, nullable=True)
    viewport_width = Column(Integer, nullable=True)
    viewport_height = Column(Integer, nullable=True)
    device_pixel_ratio = Column(String(16), nullable=True)  # e.g. "2.0"
    user_agent_normalized = Column(String(255), nullable=True)  # Truncated & normalized representation
    access_environment = Column(String(32), default=AccessEnvironment.WEB_APP.value, nullable=False)

    # Session Metrics & Aggregation
    first_seen_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    total_duration_seconds = Column(Integer, default=0, nullable=False)
    page_view_count = Column(Integer, default=0, nullable=False)
    event_count = Column(Integer, default=0, nullable=False)
    entry_route = Column(String(255), nullable=True)
    exit_route = Column(String(255), nullable=True)
    completed_workflows = Column(CompatibleJSON, default=list, nullable=False)
    abandoned_workflows = Column(CompatibleJSON, default=list, nullable=False)
    friction_count = Column(Integer, default=0, nullable=False)
    is_bounce = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

    # Relationships
    user = relationship("User", backref="behavioral_sessions")
    workspace = relationship("Workspace", backref="behavioral_sessions")
    events = relationship("BehavioralEvent", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_ubs_user_first_seen", "user_id", "first_seen_at"),
        Index("ix_ubs_created_at", "created_at"),
    )


class BehavioralEvent(Base):
    """Raw, normalized user interaction and telemetry events."""

    __tablename__ = "behavioral_events"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    session_id = Column(
        String(128), ForeignKey("user_behavioral_sessions.session_id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)

    category = Column(String(32), nullable=False, index=True)  # navigation, feature, action, workflow, friction, error
    event_name = Column(String(64), nullable=False, index=True)  # e.g. "workflow.funnel.started"
    component_id = Column(String(128), nullable=True)  # semantic UI target ID
    route = Column(String(255), nullable=False)  # path e.g. "/workspaces/assistants"
    referrer_route = Column(String(255), nullable=True)
    duration_ms = Column(Integer, nullable=True)  # Dwell or action duration
    properties = Column(CompatibleJSON, default=dict, nullable=False)  # Bounded, validated payload
    schema_version = Column(String(16), default="1.0", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    # Relationships
    session = relationship("UserBehavioralSession", back_populates="events")
    user = relationship("User", backref="behavioral_events")
    workspace = relationship("Workspace", backref="behavioral_events")

    __table_args__ = (
        Index("ix_bev_user_created", "user_id", "created_at"),
        Index("ix_bev_category_name", "category", "event_name"),
    )


class UserBehavioralProfile(Base):
    """Materialized behavioral summary linked 1:1 with User."""

    __tablename__ = "user_behavioral_profiles"

    user_id = Column(GUID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    workspace_id = Column(GUID, ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True, index=True)

    total_active_days = Column(Integer, default=0, nullable=False)
    total_sessions = Column(Integer, default=0, nullable=False)
    total_dwell_time_minutes = Column(Integer, default=0, nullable=False)

    # Device & Geolocation Aggregates
    device_category_distribution = Column(CompatibleJSON, default=dict, nullable=False)  # {"desktop": 12, "mobile": 2}
    common_browsers = Column(CompatibleJSON, default=list, nullable=False)  # ["Chrome", "Safari"]
    common_operating_systems = Column(CompatibleJSON, default=list, nullable=False)  # ["Windows", "macOS"]
    access_countries = Column(CompatibleJSON, default=list, nullable=False)  # ["DE", "US"]
    recently_used_devices = Column(
        CompatibleJSON, default=list, nullable=False
    )  # [{"category": "desktop", "os": "Windows"}]

    # Feature Usage & Friction Summaries
    feature_usage_frequency = Column(CompatibleJSON, default=dict, nullable=False)  # {"playground": 42}
    dormant_features = Column(CompatibleJSON, default=list, nullable=False)  # ["crawler"]
    friction_indicators = Column(CompatibleJSON, default=dict, nullable=False)  # {"rage_clicks": 3}
    journey_patterns = Column(CompatibleJSON, default=dict, nullable=False)  # {"top_workflow": "deploy"}

    last_active_at = Column(DateTime(timezone=True), nullable=True)
    last_profile_sync_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)

    # Relationships
    user = relationship("User", backref="behavioral_profile", uselist=False)
    workspace = relationship("Workspace")


class BehavioralInsight(Base):
    """Structured AI/LLM-generated behavioral insights with strict epistemic evidence."""

    __tablename__ = "behavioral_insights"

    id = Column(GUID, primary_key=True, default=uuid.uuid4)
    target_type = Column(String(32), nullable=False, index=True)  # "user", "workspace", "global_platform"
    target_id = Column(GUID, nullable=True, index=True)  # user_id or workspace_id
    time_window_start = Column(DateTime(timezone=True), nullable=False)
    time_window_end = Column(DateTime(timezone=True), nullable=False)

    summary = Column(Text, nullable=False)
    observed_facts = Column(CompatibleJSON, default=list, nullable=False)
    statistical_patterns = Column(CompatibleJSON, default=list, nullable=False)
    hypotheses = Column(CompatibleJSON, default=list, nullable=False)
    recommendations = Column(CompatibleJSON, default=list, nullable=False)

    confidence_level = Column(String(16), default="medium", nullable=False)  # "high", "medium", "exploratory"
    supporting_evidence = Column(CompatibleJSON, default=dict, nullable=False)
    limitations = Column(Text, nullable=True)

    model_name = Column(String(64), nullable=False)
    prompt_tokens = Column(Integer, default=0, nullable=False)
    completion_tokens = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

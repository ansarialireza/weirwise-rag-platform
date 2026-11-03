"""add weirwise behavioral intelligence tables

Revision ID: 1a2b3c4d5e6f
Revises: f7a8b9c0d1e2
Create Date: 2026-11-03 10:37:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from backend.app.db.base import CompatibleJSON, GUID

revision: str = "1a2b3c4d5e6f"
down_revision: Union[str, None] = "f7a8b9c0d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    # 1. user_behavioral_sessions
    if "user_behavioral_sessions" not in existing_tables:
        op.create_table(
            "user_behavioral_sessions",
            sa.Column("id", GUID(), primary_key=True, nullable=False),
            sa.Column("session_id", sa.String(length=128), nullable=False),
            sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("workspace_id", GUID(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("country_code", sa.String(length=2), nullable=True),
            sa.Column("country_name", sa.String(length=100), nullable=True),
            sa.Column("region", sa.String(length=100), nullable=True),
            sa.Column("city", sa.String(length=100), nullable=True),
            sa.Column("timezone", sa.String(length=50), nullable=True),
            sa.Column("geo_lookup_source", sa.String(length=50), nullable=True),
            sa.Column("device_category", sa.String(length=32), server_default="unknown", nullable=False),
            sa.Column("operating_system", sa.String(length=64), nullable=True),
            sa.Column("os_version", sa.String(length=32), nullable=True),
            sa.Column("browser", sa.String(length=64), nullable=True),
            sa.Column("browser_version", sa.String(length=32), nullable=True),
            sa.Column("screen_width", sa.Integer(), nullable=True),
            sa.Column("screen_height", sa.Integer(), nullable=True),
            sa.Column("viewport_width", sa.Integer(), nullable=True),
            sa.Column("viewport_height", sa.Integer(), nullable=True),
            sa.Column("device_pixel_ratio", sa.String(length=16), nullable=True),
            sa.Column("user_agent_normalized", sa.String(length=255), nullable=True),
            sa.Column("access_environment", sa.String(length=32), server_default="web_app", nullable=False),
            sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("total_duration_seconds", sa.Integer(), server_default="0", nullable=False),
            sa.Column("page_view_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("event_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("entry_route", sa.String(length=255), nullable=True),
            sa.Column("exit_route", sa.String(length=255), nullable=True),
            sa.Column("completed_workflows", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("abandoned_workflows", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("friction_count", sa.Integer(), server_default="0", nullable=False),
            sa.Column("is_bounce", sa.Boolean(), server_default="false", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f("ix_user_behavioral_sessions_session_id"),
            "user_behavioral_sessions",
            ["session_id"],
            unique=True,
        )
        op.create_index(
            op.f("ix_user_behavioral_sessions_user_id"),
            "user_behavioral_sessions",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_user_behavioral_sessions_workspace_id"),
            "user_behavioral_sessions",
            ["workspace_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_user_behavioral_sessions_country_code"),
            "user_behavioral_sessions",
            ["country_code"],
            unique=False,
        )
        op.create_index(
            op.f("ix_user_behavioral_sessions_device_category"),
            "user_behavioral_sessions",
            ["device_category"],
            unique=False,
        )
        op.create_index(
            "ix_ubs_user_first_seen",
            "user_behavioral_sessions",
            ["user_id", "first_seen_at"],
            unique=False,
        )
        op.create_index(
            "ix_ubs_created_at",
            "user_behavioral_sessions",
            ["created_at"],
            unique=False,
        )

    # 2. behavioral_events
    if "behavioral_events" not in existing_tables:
        op.create_table(
            "behavioral_events",
            sa.Column("id", GUID(), primary_key=True, nullable=False),
            sa.Column(
                "session_id",
                sa.String(length=128),
                sa.ForeignKey("user_behavioral_sessions.session_id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
            sa.Column("workspace_id", GUID(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("category", sa.String(length=32), nullable=False),
            sa.Column("event_name", sa.String(length=64), nullable=False),
            sa.Column("component_id", sa.String(length=128), nullable=True),
            sa.Column("route", sa.String(length=255), nullable=False),
            sa.Column("referrer_route", sa.String(length=255), nullable=True),
            sa.Column("duration_ms", sa.Integer(), nullable=True),
            sa.Column("properties", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("schema_version", sa.String(length=16), server_default="1.0", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f("ix_behavioral_events_session_id"),
            "behavioral_events",
            ["session_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_events_user_id"),
            "behavioral_events",
            ["user_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_events_workspace_id"),
            "behavioral_events",
            ["workspace_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_events_category"),
            "behavioral_events",
            ["category"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_events_event_name"),
            "behavioral_events",
            ["event_name"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_events_created_at"),
            "behavioral_events",
            ["created_at"],
            unique=False,
        )
        op.create_index(
            "ix_bev_user_created",
            "behavioral_events",
            ["user_id", "created_at"],
            unique=False,
        )
        op.create_index(
            "ix_bev_category_name",
            "behavioral_events",
            ["category", "event_name"],
            unique=False,
        )

    # 3. user_behavioral_profiles
    if "user_behavioral_profiles" not in existing_tables:
        op.create_table(
            "user_behavioral_profiles",
            sa.Column("user_id", GUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, nullable=False),
            sa.Column("workspace_id", GUID(), sa.ForeignKey("workspaces.id", ondelete="CASCADE"), nullable=True),
            sa.Column("total_active_days", sa.Integer(), server_default="0", nullable=False),
            sa.Column("total_sessions", sa.Integer(), server_default="0", nullable=False),
            sa.Column("total_dwell_time_minutes", sa.Integer(), server_default="0", nullable=False),
            sa.Column("device_category_distribution", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("common_browsers", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("common_operating_systems", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("access_countries", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("recently_used_devices", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("feature_usage_frequency", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("dormant_features", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("friction_indicators", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("journey_patterns", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("last_active_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_profile_sync_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f("ix_user_behavioral_profiles_workspace_id"),
            "user_behavioral_profiles",
            ["workspace_id"],
            unique=False,
        )

    # 4. behavioral_insights
    if "behavioral_insights" not in existing_tables:
        op.create_table(
            "behavioral_insights",
            sa.Column("id", GUID(), primary_key=True, nullable=False),
            sa.Column("target_type", sa.String(length=32), nullable=False),
            sa.Column("target_id", GUID(), nullable=True),
            sa.Column("time_window_start", sa.DateTime(timezone=True), nullable=False),
            sa.Column("time_window_end", sa.DateTime(timezone=True), nullable=False),
            sa.Column("summary", sa.Text(), nullable=False),
            sa.Column("observed_facts", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("statistical_patterns", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("hypotheses", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("recommendations", CompatibleJSON(), server_default="[]", nullable=False),
            sa.Column("confidence_level", sa.String(length=16), server_default="medium", nullable=False),
            sa.Column("supporting_evidence", CompatibleJSON(), server_default="{}", nullable=False),
            sa.Column("limitations", sa.Text(), nullable=True),
            sa.Column("model_name", sa.String(length=64), nullable=False),
            sa.Column("prompt_tokens", sa.Integer(), server_default="0", nullable=False),
            sa.Column("completion_tokens", sa.Integer(), server_default="0", nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        )
        op.create_index(
            op.f("ix_behavioral_insights_target_type"),
            "behavioral_insights",
            ["target_type"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_insights_target_id"),
            "behavioral_insights",
            ["target_id"],
            unique=False,
        )
        op.create_index(
            op.f("ix_behavioral_insights_created_at"),
            "behavioral_insights",
            ["created_at"],
            unique=False,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    existing_tables = inspector.get_table_names()

    if "behavioral_insights" in existing_tables:
        op.drop_table("behavioral_insights")
    if "user_behavioral_profiles" in existing_tables:
        op.drop_table("user_behavioral_profiles")
    if "behavioral_events" in existing_tables:
        op.drop_table("behavioral_events")
    if "user_behavioral_sessions" in existing_tables:
        op.drop_table("user_behavioral_sessions")

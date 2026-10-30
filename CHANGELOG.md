# Changelog

All notable changes to the Weirwise Platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-10-30

### Added
- **Super Admin Control Center**: Executive overview dashboard, AI provider management, FinOps unit economics tracking, and immutable audit log viewer.
- **Intelligent Credential Routing Engine**: Multi-key credential pools with weighted, priority, round-robin, and lowest-cost routing strategies.
- **Circuit Breakers & Automatic Failover**: Automatic 60-second cooldown on HTTP 429 rate limits and 300-second circuit breaker upon 3 consecutive failures.
- **Encrypted Credential Vault**: AES-128-CBC + HMAC-SHA256 Fernet encryption at rest with SHA-256 deduplication and prefix masking.
- **FinOps Accounting & Token Cost Ledger**: Real-time per-workspace and per-credential token consumption tracking, MRR/ARR derivation, and margin analytics.
- **Grounded Assistant Studio & Playground**: Conversational playground with streaming simulation, grounded source citations, and evaluation controls.
- **Multi-Tenant Architecture**: Workspaces, role-based access control (Owner, Admin, Member, Viewer), and project scoping.
- **Alembic Database Migrations**: Initial platform schema and admin/finops table migrations.
- **Next.js 14 Web Application**: Tailwind CSS styling, dark/light theme switching, command palette (`Ctrl+K`), and toast notifications.

### Fixed
- Wired `IntelligentRoutingEngine` directly into the live assistant chat lifecycle.
- Resolved offset-naive vs. offset-aware datetime comparisons during cooldown evaluations in SQLite and PostgreSQL.
- Handled micro-spend precision in financial columns using `Numeric(12, 6)`.

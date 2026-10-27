# Weirwise Platform

Enterprise Multi-tenant AI Assistant & Knowledge Platform.

Weirwise Platform is an independent SaaS and self-hosted platform allowing organizations to configure, ground, evaluate, and deploy enterprise AI assistants powered by Weirwise Core.

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Domain Model & Invariants](docs/DOMAIN_MODEL.md)
- [API Contracts & Integration](docs/API_CONTRACTS.md)
- [Security & Threat Model](docs/SECURITY.md)
- [Development Setup](docs/DEVELOPMENT.md)
- [Architectural Decision Records (ADRs)](docs/adr/)

## Quick Start (Backend)

```bash
# Run tests
pytest backend/tests -v

# Start development server
uvicorn backend.app.main:app --reload
```

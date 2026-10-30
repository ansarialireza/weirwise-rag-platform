# Contributing to Weirwise Platform

Thank you for your interest in contributing to Weirwise Platform! We welcome contributions from developers, researchers, designers, and documentation writers.

## Code of Conduct

All contributors and maintainers are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please read it before participating.

---

## Development Setup

For comprehensive instructions on setting up your local environment, see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md).

### Quick Start Prerequisites
- **Python**: 3.11+
- **Node.js**: 18+ (Node 20 LTS recommended)
- **Database**: PostgreSQL 15+ (or local SQLite for dev/testing)
- **Redis**: 7.0+ (optional for basic local testing, required for async task workers)

### Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
pip install -e ".[dev]"
```

Run test suite:
```bash
pytest tests -v
```

Check code formatting and linting:
```bash
ruff check .
ruff format --check .
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Type checking and linting:
```bash
npm run type-check
npm run lint
npm run build
```

---

## Branching & Commit Guidelines

- **Branch naming**: Use descriptive branch names:
  - `feat/feature-name`
  - `fix/bug-description`
  - `docs/doc-update`
  - `test/test-improvement`
- **Conventional Commits**: Format your commits clearly:
  - `feat: add api key rotation endpoint`
  - `fix: resolve offset-naive datetime comparison in routing engine`
  - `docs: update quickstart guide`
  - `test: add e2e test for multi-tenant isolation`

---

## Pull Request Process

1. **Fork the repository** and clone your fork.
2. **Create a branch** off `main`.
3. **Write code and tests**: Ensure all existing and new unit/integration tests pass.
4. **Run linters and type checks**:
   - Backend: `ruff check .`
   - Frontend: `npm run lint` & `npm run type-check`
5. **Update documentation**: If introducing new endpoints, models, or configuration variables, update `.env.example`, `docs/API_CONTRACTS.md`, or the `README.md`.
6. **Submit PR**: Open a Pull Request with a clear summary of changes, motivation, and verification steps.

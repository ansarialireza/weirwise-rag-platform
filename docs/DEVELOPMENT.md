# Weirwise Platform Development & Setup Guide

## 1. Prerequisites

- **Python:** 3.11+
- **Node.js:** 18+ (Node 20+ recommended)
- **Docker & Docker Compose:** For running local services (PostgreSQL, Redis, MinIO).
  *(Note: SQLite and local storage fallbacks can be used during early local testing if Docker is unavailable).*

---

## 2. Environment Configuration

1. Clone or navigate to the repository:
   ```bash
   cd "Weirwise Platform"
   ```

2. Copy the sample environment file:
   ```bash
   cp .env.example .env
   ```

3. Configure your local parameters in `.env`.

---

## 3. Starting Local Supporting Services

Using Docker Compose:
```bash
docker compose up -d
```
This spins up:
- Platform PostgreSQL (`localhost:5433`)
- Platform Redis (`localhost:6379`)
- Platform MinIO Object Storage (`localhost:9000` / Console on `9001`)

---

## 4. Backend Setup & Local Execution

1. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # Linux/macOS:
   source .venv/bin/activate
   ```

2. Install dependencies:
   ```bash
   pip install -e backend/
   pip install -r backend/requirements.txt
   ```

3. Run the development server:
   ```bash
   uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

4. Verify health endpoints:
   ```bash
   curl http://localhost:8000/health/live
   curl http://localhost:8000/health/ready
   ```

5. Run test suite:
   ```bash
   pytest backend/tests -v
   ```

---

## 5. Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

# Platform Frontend Architecture

## Current structure

The browser application uses Next.js 15 App Router, React, TypeScript, and Tailwind CSS.

| Area | Location | Responsibility |
|---|---|---|
| Routes and layouts | `frontend/src/app/` | Public site, auth pages, dashboard pages, assistant playground, and embed page. |
| Shared UI | `frontend/src/components/` | Navigation, responsive shell, landing experience, preferences, and reusable UI. |
| API client and auth | `frontend/src/lib/api.ts`, `auth-context.tsx` | Calls Platform HTTP APIs, manages in-memory access-token state, refreshes via cookie, and exposes user session state. |
| Localization | `frontend/src/lib/i18n/`, `frontend/src/dictionaries/` | Locale dictionaries, language selection, and text direction. |
| Theme and telemetry | `frontend/src/lib/theme-context.tsx`, `frontend/src/lib/telemetry/` | Theme preferences and telemetry integration/sanitization. |
| Shared contracts | `frontend/src/types/` | TypeScript representations used by UI and API client. |

## Boundaries and conventions

- Keep browser components presentational where practical; put API calls in the API client and
  server-side authorization in FastAPI. The browser is never an authority for resource ownership.
- Keep secrets out of `NEXT_PUBLIC_*` variables, client state persistence, URLs, telemetry, and
  rendered errors. Dashboard authentication uses the API's cookie/Bearer contract.
- Keep API types aligned with backend Pydantic response schemas. A TypeScript type is not proof
  that a route or backend capability exists.
- Follow existing route-group, localization, theme-token, responsive, and accessibility patterns.
  Add user-visible strings to the localization dictionaries rather than hard-coding them in pages.
- Keep embed/public runtime behavior separate from authenticated dashboard behavior.

## Account context and compatibility

The dashboard operates in the single account resolved by the authenticated user. It has no workspace
switcher or account-selected tenant ID; ownership remains a backend decision. The frontend removes
workspace telemetry state and the unused workspace translation label. A stale local-storage key is
still cleared during API client initialization for cleanup. The workspace/project API compatibility
layer is deprecated and must not be used to build new UI. Do not infer backend authorization or
shared-account support from legacy names.

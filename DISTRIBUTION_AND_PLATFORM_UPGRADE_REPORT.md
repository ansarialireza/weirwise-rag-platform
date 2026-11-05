# Distribution & Platform Hardening Report

Date: 2026-11-05
Repository: `weirwise-rag-platform` (`develop`)
Scope: assistant distribution/deployment capabilities, framework security, and verification.

## 1. Summary

This pass closed the functional gaps in assistant distribution and resolved the open critical
Next.js advisories recorded in `FINAL_ENGINEERING_READINESS_REPORT.md`.

**Verdict: distribution works end to end in automated tests and the widget loader was verified in a
real browser. The platform is still not production-ready** because no dev/production deployment was
performed and several previously documented limits (PostgreSQL soak, multi-worker state, live chat
with provider quota) remain open.

## 2. Assistant distribution delivered

| Capability | Status | Where |
|---|---|---|
| Floating website chat widget | Delivered | `frontend/public/widget.js` |
| Inline iframe embed | Delivered | assistant Deploy tab |
| Shareable standalone page | Delivered | `/embed/{assistant_id}` |
| Domain allowlist editing | Delivered | Deploy tab + `PATCH /deployments/{id}` |
| API access (server-to-server) | Delivered | `X-API-Key` on public config/chat |
| API key creation / listing / revocation | Delivered | workspace endpoints + Deploy tab |
| Unified deployment UI | Delivered | assistant **Deploy** tab |

Behaviour notes:

- API keys are workspace-scoped, hashed at rest, returned raw once, and revoked immediately.
- Widget keys remain browser-facing and are checked against `Origin`/`Referer` with exact hostname
  matching, including `*.example.com` wildcards.
- API-key requests bypass browser domain rules deliberately (server-to-server), but still require the
  assistant to be published and the key's workspace to own the assistant.
- Config now enforces the same published/domain rules as chat.

## 3. Framework security

| Item | Before | After |
|---|---|---|
| `next` | 14.2.35 | 15.5.29 |
| `eslint-config-next` | 14.2.5 | 15.5.29 |
| npm audit | 1 critical, 7 high, 8 total | 0 critical, 1 high, 8 total |

Changes required by the upgrade:

- `next-mdx-remote` added to `transpilePackages` to fix its React 18 RSC runtime under Next 15.
- Blog route `params` changed to `Promise<{ slug: string }>` and awaited, per Next 15.

Remaining advisories are transitive build-tool packages (`postcss`, `minimatch`,
`@typescript-eslint/*`). The one direct `next` advisory is moderate; the critical RCE advisories are
cleared.

## 4. Verification evidence

| Check | Command | Result |
|---|---|---|
| Backend tests | `python -m pytest` in `backend/` | **77 passed, 12 skipped** (34.94 s) |
| New distribution tests | `python -m pytest tests/test_distribution_and_api_access.py` | **3 passed** |
| Backend lint | `python -m ruff check app` | Passed |
| Frontend type check | `npm run type-check` | Passed |
| Frontend lint | `npm run lint` | No warnings or errors |
| Production build | `npm run build` | Passed on Next.js 15.5.29 |
| Dependency audit | `npm audit` | 0 critical |
| Widget loader syntax | `node --check public/widget.js` | Passed |
| Widget browser check | Chrome DevTools on a static host page | Launcher rendered, panel opened with correct embed URL, `Escape` closed it, focus returned |

The 12 skipped backend tests are unchanged: eleven require Redis, one requires live Core/embedding
access. They are not passes.

## 5. Not verified / limitations

- **No deployment was performed.** The brief asks for a Firebase environment, but this repository has
  no Firebase configuration; deployment is GitHub Actions over SSH to `/srv/weirwise/dev`
  (`https://dev.weirwise.com`). Pushing `develop` triggers that deploy, so it was left to explicit
  authorization.
- No live chat round trip was exercised for API keys; tests assert authentication, scoping, and
  revocation, but not an LLM answer, because that needs live Core + provider quota.
- The Deploy tab itself was type-checked, linted, and built, but not driven in a browser with a real
  account. The widget loader was browser-verified independently.
- No load/soak test was run against the new API-key path.
- Existing limits remain: no PostgreSQL load evidence, no multi-worker shared-state proof, and no
  external penetration test.

## 6. Operational notes

- Runtime databases (`platform_*.db`, `weirwise.db`) and uploads are untracked and remain outside the
  committed tree. They still live in the repository working directory; relocating them is a separate
  operational change and was not done here.
- No merge to `main`, no production action, and no force-push occurred.

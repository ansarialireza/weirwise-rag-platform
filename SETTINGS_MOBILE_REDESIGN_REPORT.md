# SETTINGS AND GLOBAL MOBILE EXPERIENCE REDESIGN REPORT
**Weirwise Platform — Native Android Quality Architecture**
**Date:** November 8, 2026  
**Target Environment:** `develop` branch (`dev.weirwise.com`)  
**Deployment Containers:** `weirwise-dev-frontend` (port 3001), `weirwise-dev-backend` (port 8001)

---

## 1. Executive Summary

The Weirwise Settings page and global mobile experience have been redesigned to deliver a native-quality Android application feel combining:
- **Material Design 3 (MD3):** Bottom navigation active pill indicator (`w-16 h-8 rounded-full`), bottom sheet interaction patterns, drag handle affordances, and strict 44–56px touch target ergonomics.
- **Linear Aesthetics:** Restrained, grouped inset list tiles, seamless horizontal segmented control for appearance, crisp typography hierarchy, and quiet borders.
- **Stripe Polish:** Unified Profile & Subscription hero card with live usage progress meters and high-contrast action buttons.
- **Weirwise Brand Identity:** Approved `WeirwiseWordmark` and `WeirwiseMark` geometry preserved without distortion, verdigris/mint primary accent, ink canvas (`#0B0D0E`), and paper light theme (`#F7F6F3`).

---

## 2. Modified & Created Files

| File | Status | Description |
|---|---|---|
| `frontend/src/components/layout/app-topbar.tsx` | Modified | Sticky 56px top app bar with approved brand mark, page title, quick search, and 44x44px circular avatar touch target. |
| `frontend/src/components/layout/mobile-bottom-nav.tsx` | Modified | MD3 mobile bottom navigation with horizontal pill indicator, single-line non-wrapping labels, "Test" label, and Android safe-area insets. |
| `frontend/src/components/ui/bottom-sheet.tsx` | New | Accessible, animated native bottom sheet with touch drag handle, dimmed backdrop, tap-outside dismissal, Escape key listener, and `z-[70]` layering. |
| `frontend/src/app/(site)/(dashboard)/settings/page.tsx` | Modified | Redesigned Settings screen featuring Profile Hero, horizontal Appearance segmented control, Language list tile + bottom sheet, and confirmation-guarded Logout. |
| `frontend/src/app/(site)/(dashboard)/layout.tsx` | Modified | Global content spacing adjusted (`pb-24`) to eliminate content clipping behind the sticky top bar and fixed bottom navigation. |
| `frontend/src/dictionaries/en.json` | Modified | Updated "Test assistant" -> "Test" for clean, single-line mobile navigation. |
| `frontend/src/dictionaries/fa.json` | Modified | Updated "آزمایش دستیار" -> "آزمایش" for Persian single-line mobile navigation. |

---

## 3. Detailed Component & UX Specifications

### 3.1 Global Sticky Top App Bar (`AppTopbar`)
- **Height & Behavior:** Exactly 56px (`h-14`), sticky top with `backdrop-blur-md` and `border-b border-border/80`.
- **Start / Left:** Approved Weirwise wordmark (`WeirwiseWordmark` linking to `/overview`) ensuring immediate brand presence on mobile. Desktop retains breadcrumb/page title.
- **End / Right:**
  - Quick Search button (icon on mobile, `Cmd+K` keyboard shortcut trigger on desktop).
  - Circular avatar button with safe initials extraction from `user.full_name` or `user.email`.
  - Touch target meets the strict 44x44px interaction standard (`min-h-[44px] min-w-[44px]`).

### 3.2 Material Design 3 Bottom Navigation (`MobileBottomNav`)
- **Dimensions & Pill Indicator:**
  - Replaced the circular indicator with an MD3 horizontal pill indicator (`h-8 w-14 sm:w-16 rounded-full bg-accent/15 text-accent`).
  - Active tab icon renders with `stroke-[2.2]` and subtle scale up.
- **Tab Items (All on one single line):**
  1. `Overview` (`/overview`)
  2. `Knowledge` (`/sources`)
  3. `Assistants` (`/assistants`)
  4. `Test` (`/playground` — shortened from "Test assistant")
  5. `Settings` (`/settings`)
- **Zero Horizontal Overflow:** Verified down to 320px screen width without text wrapping or overlapping.
- **Safe-Area Insets:** Supports `paddingBottom: max(0.25rem, env(safe-area-inset-bottom, 0px))`.

### 3.3 Settings Redesign
1. **Profile & Subscription Hero Card:**
   - Displays user identity (derived initials avatar, name/email, and plan tier badge).
   - Monthly query usage meter with live progress bar (`chat_turns_used / chat_turns_limit`).
   - High-contrast pill-shaped **Upgrade** primary button (`bg-accent text-accent-foreground`) and **Billing** secondary button.
2. **Appearance Segmented Control:**
   - Replaced heavy cards with a 3-way horizontal segmented pill control: **Light**, **Dark**, and **System**.
   - Smooth pill transition with immediate theme activation via `setTheme()` and persistent storage in `localStorage` (`wwp_theme`).
3. **Language List Tile & Native Bottom Sheet:**
   - 56px list row with Globe icon, current selection indicator, and chevron.
   - Tapping opens the `BottomSheet` sliding up with dimmed backdrop, drag handle, and checkmark selection.
   - Switching between English (LTR) and فارسی (RTL) updates the `html[dir]` attribute, font family stack, and layout direction dynamically.
4. **Account Actions & Guarded Logout:**
   - Destructive list row (`border-destructive/20 bg-destructive/10 text-destructive`).
   - Clicking opens a confirmation bottom sheet explaining that the session will terminate.
   - Supports **Cancel** (session kept intact) and **Yes, sign out** (executes `logout()` and redirects to `/login`).

---

## 4. Visual QA & Responsive Viewport Validation

Automated browser tests were performed with Playwright on the live dev environment (`http://127.0.0.1:3001` / `https://dev.weirwise.com`) across mobile, tablet, and desktop viewports.

### Captured Screenshots Directory
All visual evidence has been saved outside the repository at:  
`/home/agyops/var/qa/settings-mobile-redesign/`

| Screenshot Artifact | Description & Viewport | Status |
|---|---|---|
| `01_settings_dark_english.png` | Settings page in Dark mode on Android Standard (390×844) | Verified |
| `02_settings_light_mode.png` | Settings page in Light mode on Android Standard (390×844) | Verified |
| `03_language_bottom_sheet_en.png` | Language bottom sheet open in English (390×844) | Verified |
| `04_settings_persian_rtl.png` | Settings page in Persian RTL mode (390×844) | Verified |
| `05_language_bottom_sheet_fa_rtl.png` | Language bottom sheet in Persian RTL mode (390×844) | Verified |
| `06_overview_app_bar_mobile.png` | Main Dashboard Overview with 56px sticky app bar | Verified |
| `07_bottom_nav_active_test.png` | Active MD3 pill indicator on "Test" tab (`/playground`) | Verified |
| `08_logout_confirmation_sheet.png` | Destructive logout confirmation bottom sheet | Verified |
| `09_narrowest_320px_settings.png` | Settings and 5-item bottom navigation at 320×640 | Verified (Zero overflow) |
| `10_desktop_settings.png` | Responsive Settings layout on Desktop (1440×900) | Verified |
| `11_logged_out_redirect.png` | Post-logout redirect landing cleanly on `/login` | Verified |

---

## 5. Functional & Automated Verification

1. **Frontend Production Build:**
   - Executed clean Next.js build inside Docker: `docker compose -f docker-compose.dev.yml build dev-frontend` -> **Success (Exit Code 0)**.
2. **Backend Regression Tests:**
   - Executed `docker exec weirwise-dev-backend pytest backend/tests/test_direct_user_architecture.py backend/tests/test_auth.py` -> **7 passed (100% pass rate)**.
3. **Live Health:**
   - `http://127.0.0.1:3001` returns `HTTP 200 OK`.
   - `http://127.0.0.1:8001/health/live` returns `HTTP 200 OK`.
   - Public dev endpoint `https://dev.weirwise.com` confirmed operational.

---

## 6. Git Branch & Commit Details

- **Branch:** `develop`
- **Main Status:** Untouched (Never merged into `main`).
- **Production Status:** Unaltered (Deployed exclusively to dev containers).

import asyncio
import os
import sys
import uuid
import re
import subprocess
import json
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "https://dev.weirwise.com")

VIEWPORTS = [
    {"name": "Narrow Android (320px)", "width": 320, "height": 640},
    {"name": "Standard Android (360px)", "width": 360, "height": 740},
    {"name": "iPhone SE / Small (375px)", "width": 375, "height": 667},
    {"name": "iPhone 14 / Modern (390px)", "width": 390, "height": 844},
    {"name": "Pixel 7 / Android Large (412px)", "width": 412, "height": 915},
    {"name": "Pro Max / Ultra (430px)", "width": 430, "height": 932},
]

DASHBOARD_ROUTES = [
    "/overview",
    "/sources",
    "/assistants",
    "/playground",
    "/settings",
]

async def run_regression_tests():
    print("=" * 80)
    print("STARTING MOBILE BOTTOM NAVIGATION RIGOROUS REGRESSION TEST SUITE")
    print(f"Target URL: {BASE_URL}")
    print("=" * 80)

    total_checks_passed = 0
    total_checks_failed = 0

    uid = uuid.uuid4().hex[:6]
    test_email = f"mob_rigor_{uid}@weirwise-test.internal"
    test_password = "Password123!"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        
        for vp in VIEWPORTS:
            vp_name = vp["name"]
            width = vp["width"]
            height = vp["height"]
            print(f"\n--- Testing Viewport: {vp_name} ({width}x{height}) ---")

            context = await browser.new_context(
                viewport={"width": width, "height": height},
                user_agent="Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
                has_touch=True,
                is_mobile=True,
            )
            page = await context.new_page()

            # Condition 1: Verify bottom nav does NOT appear on unauthenticated /login
            await page.goto(f"{BASE_URL}/login")
            await page.wait_for_load_state("networkidle")
            nav_on_login = await page.query_selector("nav[aria-label='Mobile Bottom Navigation']")
            assert nav_on_login is None, f"[{vp_name}] Bottom nav should not appear on unauthenticated /login"
            total_checks_passed += 1
            print(f"  ✓ [{vp_name}] Logged-out state: Bottom nav correctly absent on /login")

            # First viewport registers account
            if vp == VIEWPORTS[0]:
                print("  Registering user account...")
                await page.goto(f"{BASE_URL}/register")
                await page.fill("input[type='email']", test_email)
                await page.fill("input[type='password']", test_password)
                await page.click("button[type='submit']")
                await page.wait_for_url("**/verify-email*", timeout=10000)

                log_out = subprocess.run(["docker", "logs", "weirwise-dev-backend", "--tail", "25"], capture_output=True, text=True).stdout
                otp_match = re.search(r"Your verification code is:\s*([0-9]{4,6})", log_out)
                assert otp_match, f"OTP not found in logs: {log_out}"
                otp_code = otp_match.group(1)

                await page.locator("input[autocomplete='one-time-code'], input[placeholder='000000']").fill(otp_code)
                await page.click("button[type='submit']")
                await page.wait_for_url("**/login*", timeout=10000)
                total_checks_passed += 1
                print("  ✓ Account registered and OTP verified successfully.")

            # Condition 2: Navigation works immediately after login
            print(f"  Logging in on {vp_name}...")
            await page.goto(f"{BASE_URL}/login")
            await page.fill("input[type='email']", test_email)
            await page.fill("input[type='password']", test_password)
            await page.click("button[type='submit']")
            await page.wait_for_url("**/overview*", timeout=12000)

            bnav = page.locator("nav[aria-label='Mobile Bottom Navigation']")
            await bnav.wait_for(state="visible", timeout=5000)
            assert await bnav.is_visible(), f"[{vp_name}] Bottom nav not immediately visible after login"
            total_checks_passed += 1
            print(f"  ✓ [{vp_name}] Navigation rendered immediately after login without refresh/transitions")

            # Condition 2b: Immediate mount stability check (assert zero initial vertical shift / transform dislocation)
            immediate_mount_geometry = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                if (!nav) return null;
                const rect = nav.getBoundingClientRect();
                const svgs = Array.from(nav.querySelectorAll("svg")).map(s => s.getBoundingClientRect());
                const style = window.getComputedStyle(nav);
                return {
                    navTop: rect.top,
                    navBottom: rect.bottom,
                    navHeight: rect.height,
                    transform: style.transform,
                    svgTops: svgs.map(s => s.top)
                };
            }""")
            assert immediate_mount_geometry is not None
            # Wait 400ms (beyond the standard 280ms route animation window)
            await page.wait_for_timeout(400)
            steady_state_geometry = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                if (!nav) return null;
                const rect = nav.getBoundingClientRect();
                const svgs = Array.from(nav.querySelectorAll("svg")).map(s => s.getBoundingClientRect());
                return {
                    navTop: rect.top,
                    navBottom: rect.bottom,
                    navHeight: rect.height,
                    svgTops: svgs.map(s => s.top)
                };
            }""")
            # Verify delta between immediate mount and steady state is 0 (no initial displacement shift)
            assert abs(immediate_mount_geometry["navTop"] - steady_state_geometry["navTop"]) < 0.5, (
                f"[{vp_name}] Initial mount shift detected! Immediate: {immediate_mount_geometry['navTop']}px vs Steady: {steady_state_geometry['navTop']}px"
            )
            for idx, (imm_top, steady_top) in enumerate(zip(immediate_mount_geometry["svgTops"], steady_state_geometry["svgTops"])):
                assert abs(imm_top - steady_top) < 0.5, (
                    f"[{vp_name}] Icon {idx} shifted vertically from {imm_top}px to {steady_top}px!"
                )
            total_checks_passed += 2
            print(f"  ✓ [{vp_name}] Zero initial position shift verified: geometry invariant from initial render through steady state")

            # Condition 3 & 4 & 5: All 5 icons have visible bounding boxes, are inside viewport, and no element overlays clickable area
            icon_validation = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                if (!nav) return { found: false, error: "Nav not found" };

                const navRect = nav.getBoundingClientRect();
                const vh = window.innerHeight;
                const vw = window.innerWidth;
                const links = Array.from(nav.querySelectorAll("a"));
                const svgs = Array.from(nav.querySelectorAll("svg"));

                if (svgs.length !== 5) {
                    return { found: true, error: `Expected 5 svgs, found ${svgs.length}` };
                }

                const iconChecks = svgs.map((svg, i) => {
                    const rect = svg.getBoundingClientRect();
                    const style = window.getComputedStyle(svg);
                    const link = svg.closest("a");
                    const linkRect = link ? link.getBoundingClientRect() : null;

                    // Verify bounding box inside viewport
                    const inViewport = (
                        rect.top >= 0 &&
                        rect.bottom <= vh &&
                        rect.left >= 0 &&
                        rect.right <= vw &&
                        rect.width >= 16 &&
                        rect.height >= 16
                    );

                    // Check element from point at center of icon to verify nothing overlays it
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const elAtCenter = document.elementFromPoint(centerX, centerY);

                    // Clickable / overlay check: element at center must be the svg itself, a path inside it, or its parent link/container
                    const notCovered = elAtCenter && (svg.contains(elAtCenter) || svg === elAtCenter || (link && link.contains(elAtCenter)));

                    return {
                        index: i,
                        inViewport,
                        notCovered,
                        styleVisibility: style.visibility === "visible" && style.display !== "none" && parseFloat(style.opacity) > 0,
                        width: rect.width,
                        height: rect.height,
                        top: rect.top,
                        bottom: rect.bottom,
                        elAtCenterTag: elAtCenter ? elAtCenter.tagName : null,
                        elAtCenterClass: elAtCenter ? elAtCenter.className : null
                    };
                });

                return {
                    found: true,
                    navTop: navRect.top,
                    navBottom: navRect.bottom,
                    navHeight: navRect.height,
                    vh,
                    vw,
                    iconChecks,
                    allValid: iconChecks.every(c => c.inViewport && c.notCovered && c.styleVisibility)
                };
            }""")

            assert icon_validation["found"] and icon_validation.get("allValid"), f"[{vp_name}] Icon checks failed: {json.dumps(icon_validation, indent=2)}"
            total_checks_passed += 5  # 5 icons validated for bounding box, viewport inclusion, visibility, and overlay freedom
            print(f"  ✓ [{vp_name}] All 5 icons verified: bounding boxes strictly inside viewport ({icon_validation['navTop']:.1f}px - {icon_validation['navBottom']:.1f}px), no overlay obstructions")

            # Condition 6: Navigation remains visible after route transitions across all 5 dashboard sections
            for r in DASHBOARD_ROUTES:
                link = page.locator(f"nav[aria-label='Mobile Bottom Navigation'] a[href='{r}']")
                await link.click()
                await page.wait_for_url(f"**{r}*", timeout=8000)
                await page.wait_for_timeout(350)  # Allow transition

                assert await bnav.is_visible(), f"[{vp_name}] Bottom nav hidden on route {r}"
                
                # Active indicator assertion
                classes = await link.get_attribute("class") or ""
                assert "text-foreground" in classes, f"[{vp_name}] Route {r} should have active class"

                # Check all 5 icons still visible and not overlaid on this route
                icons_visible = await page.evaluate("""() => {
                    const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                    const svgs = Array.from(nav.querySelectorAll("svg"));
                    return svgs.every(svg => {
                        const r = svg.getBoundingClientRect();
                        const el = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
                        return r.width > 0 && r.height > 0 && r.bottom <= window.innerHeight && (svg.contains(el) || svg === el || svg.closest("a").contains(el));
                    });
                }""")
                assert icons_visible, f"[{vp_name}] Icons obstructed or invisible on route {r}"
                total_checks_passed += 1

            print(f"  ✓ [{vp_name}] Persistent across all route transitions: /overview, /sources, /assistants, /playground, /settings")

            # Condition 7: Navigation remains visible during and after scrolling (top, middle, bottom, rapid scroll)
            await page.goto(f"{BASE_URL}/overview")
            await page.wait_for_load_state("networkidle")

            # Check at top
            top_check = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                const rect = nav.getBoundingClientRect();
                return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
            }""")
            assert top_check, f"[{vp_name}] Nav displaced at scroll top"
            total_checks_passed += 1

            # Scroll to middle
            await page.evaluate("""() => {
                const main = document.querySelector("#main-content");
                if (main) main.scrollTop = main.scrollHeight / 2;
            }""")
            await page.wait_for_timeout(100)
            mid_check = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                const rect = nav.getBoundingClientRect();
                return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
            }""")
            assert mid_check, f"[{vp_name}] Nav displaced at scroll middle"
            total_checks_passed += 1

            # Scroll to bottom
            await page.evaluate("""() => {
                const main = document.querySelector("#main-content");
                if (main) main.scrollTop = main.scrollHeight;
            }""")
            await page.wait_for_timeout(100)
            bot_check = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                const rect = nav.getBoundingClientRect();
                return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
            }""")
            assert bot_check, f"[{vp_name}] Nav displaced at scroll bottom"
            total_checks_passed += 1

            # Rapid scroll up and down
            for _ in range(5):
                await page.evaluate("""() => {
                    const main = document.querySelector("#main-content");
                    if (main) main.scrollTop = 0;
                }""")
                await page.evaluate("""() => {
                    const main = document.querySelector("#main-content");
                    if (main) main.scrollTop = main.scrollHeight;
                }""")
            await page.wait_for_timeout(100)

            rapid_check = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                const rect = nav.getBoundingClientRect();
                return rect.top >= 0 && rect.bottom <= window.innerHeight + 1;
            }""")
            assert rapid_check, f"[{vp_name}] Nav displaced after rapid scroll"
            total_checks_passed += 1
            print(f"  ✓ [{vp_name}] Scroll stability verified: top, middle, bottom, and rapid scroll")

            # Hard reload persistence
            await page.reload()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(350)
            assert await bnav.is_visible(), f"[{vp_name}] Bottom nav disappeared after page reload"
            total_checks_passed += 1
            print(f"  ✓ [{vp_name}] Navigation persistent across hard reload")

            # Capture visual evidence from running build
            os.makedirs("/home/agyops/var/qa/mobile_nav_regression", exist_ok=True)
            shot_path = f"/home/agyops/var/qa/mobile_nav_regression/evidence_{width}x{height}.png"
            await page.screenshot(path=shot_path)
            total_checks_passed += 1
            print(f"  ✓ [{vp_name}] Visual screenshot captured: {shot_path}")

            await context.close()

        # Desktop Regression
        print("\n--- Testing Desktop Regression (1440x900) ---")
        d_context = await browser.new_context(viewport={"width": 1440, "height": 900})
        d_page = await d_context.new_page()
        await d_page.goto(f"{BASE_URL}/login")
        await d_page.fill("input[type='email']", test_email)
        await d_page.wait_for_timeout(100)
        await d_page.fill("input[type='password']", test_password)
        await d_page.click("button[type='submit']")
        await d_page.wait_for_url("**/overview*", timeout=10000)

        d_bnav = d_page.locator("nav[aria-label='Mobile Bottom Navigation']")
        assert not await d_bnav.is_visible(), "Bottom nav should NOT be visible on desktop"
        d_sidebar = d_page.locator("aside, nav[aria-label='Main Navigation']")
        assert await d_sidebar.first.is_visible(), "Desktop sidebar must be visible on desktop"
        total_checks_passed += 2
        print("  ✓ Desktop view verified: MobileBottomNav hidden via md:hidden, Sidebar visible")
        
        shot_path_desk = "/home/agyops/var/qa/mobile_nav_regression/evidence_desktop_1440x900.png"
        await d_page.screenshot(path=shot_path_desk)
        await d_context.close()

        await browser.close()

    print("\n" + "=" * 80)
    print(f"TEST EXECUTION COMPLETE: {total_checks_passed} PASSED, {total_checks_failed} FAILED")
    print("=" * 80)
    assert total_checks_failed == 0

if __name__ == "__main__":
    asyncio.run(run_regression_tests())

import asyncio
import os
import sys
import uuid
import re
import subprocess
import json
from playwright.async_api import async_playwright

BASE_URL = "https://dev.weirwise.com"

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
    print("STARTING MOBILE BOTTOM NAVIGATION REGRESSION & ACCEPTANCE TEST SUITE")
    print("=" * 80)

    # 1. Register test user
    uid = uuid.uuid4().hex[:6]
    test_email = f"mob_reg_{uid}@weirwise-test.internal"
    test_password = "Password123!"

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
        
        # Test across all 6 viewports
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

            # Step 1: Open Login Page while logged out
            await page.goto(f"{BASE_URL}/login")
            await page.wait_for_load_state("networkidle")
            nav_on_login = await page.query_selector("nav[aria-label='Mobile Bottom Navigation']")
            assert nav_on_login is None, f"[{vp_name}] Bottom nav should not appear on unauthenticated /login"
            print(f"  ✓ [{vp_name}] Logged-out state: Bottom nav correctly absent on /login")

            # If user does not exist yet, register now
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
                print("  ✓ Account verified successfully.")

            # Step 2: Log in
            print(f"  Logging in on {vp_name}...")
            await page.goto(f"{BASE_URL}/login")
            await page.fill("input[type='email']", test_email)
            await page.fill("input[type='password']", test_password)
            await page.click("button[type='submit']")
            await page.wait_for_url("**/overview*", timeout=12000)

            # Step 3: Immediately verify MobileBottomNav visibility & hierarchy
            bnav = page.locator("nav[aria-label='Mobile Bottom Navigation']")
            await bnav.wait_for(state="visible", timeout=5000)
            assert await bnav.is_visible(), f"[{vp_name}] Bottom nav not immediately visible after login"

            # Check that all 5 icons exist and are visible
            icons = await page.locator("nav[aria-label='Mobile Bottom Navigation'] svg").all()
            assert len(icons) == 5, f"[{vp_name}] Expected 5 icons, got {len(icons)}"
            for i, icon in enumerate(icons):
                assert await icon.is_visible(), f"[{vp_name}] Icon {i} is not visible"
            print(f"  ✓ [{vp_name}] 5 navigation icons visible immediately after login")

            # Check icon bounding box and visibility via JS
            metrics = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                const rect = nav.getBoundingClientRect();
                const svgs = Array.from(nav.querySelectorAll("svg"));
                return {
                    navTop: rect.top,
                    navBottom: rect.bottom,
                    navHeight: rect.height,
                    vh: window.innerHeight,
                    icons: svgs.map(s => {
                        const r = s.getBoundingClientRect();
                        return { top: r.top, bottom: r.bottom, width: r.width, height: r.height };
                    })
                };
            }""")
            assert metrics["navBottom"] <= height + 1 and metrics["navTop"] >= height - 80, f"[{vp_name}] Unexpected nav rect: {metrics}"
            print(f"  ✓ [{vp_name}] Nav correctly anchored to viewport bottom (top: {metrics['navTop']:.1f}px, bottom: {metrics['navBottom']:.1f}px, vh: {metrics['vh']}px)")

            # Step 4: Route transitions across all dashboard pages
            for r in DASHBOARD_ROUTES:
                link = page.locator(f"nav[aria-label='Mobile Bottom Navigation'] a[href='{r}']")
                await link.click()
                await page.wait_for_url(f"**{r}*", timeout=8000)
                await page.wait_for_timeout(350) # allow transition
                assert await bnav.is_visible(), f"[{vp_name}] Bottom nav hidden on route {r}"
                
                # Check active class
                classes = await link.get_attribute("class") or ""
                assert "text-foreground" in classes, f"[{vp_name}] Route {r} should have active class"
                
                # Check icons still visible
                for i, icon in enumerate(icons):
                    assert await icon.is_visible(), f"[{vp_name}] Icon {i} not visible on route {r}"
            print(f"  ✓ [{vp_name}] All route transitions passed with persistent bottom nav & active state")

            # Step 5: Scrolling verification (top, middle, bottom, rapid scrolling)
            await page.goto(f"{BASE_URL}/overview")
            await page.wait_for_load_state("networkidle")
            
            # Scroll to top (default)
            scroll_status = await page.evaluate("""() => {
                const main = document.querySelector("#main-content");
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                return {
                    initialNavTop: nav.getBoundingClientRect().top
                };
            }""")
            
            # Scroll to bottom
            await page.evaluate("""() => {
                const main = document.querySelector("#main-content");
                if (main) main.scrollTop = main.scrollHeight;
            }""")
            await page.wait_for_timeout(100)
            
            # Rapid scroll up and down
            for _ in range(5):
                await page.evaluate("""() => {
                    const main = document.querySelector("#main-content");
                    if (main) main.scrollTop = 0;
                }""")
                await page.evaluate("""() => {
                    const main = document.querySelector("#main-content");
                    if (main) main.scrollTop = main.scrollHeight / 2;
                }""")
                await page.evaluate("""() => {
                    const main = document.querySelector("#main-content");
                    if (main) main.scrollTop = main.scrollHeight;
                }""")
            
            # Verify nav is still firmly at bottom of viewport
            final_nav_top = await page.evaluate("""() => {
                const nav = document.querySelector("nav[aria-label='Mobile Bottom Navigation']");
                return nav.getBoundingClientRect().top;
            }""")
            assert abs(final_nav_top - metrics["navTop"]) < 1.0, f"[{vp_name}] Nav shifted after rapid scroll: initial={metrics['navTop']}, final={final_nav_top}"
            print(f"  ✓ [{vp_name}] Scroll stability verified: top, middle, bottom, and rapid scroll")

            # Step 6: Hard refresh / reload
            await page.reload()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(350)
            assert await bnav.is_visible(), f"[{vp_name}] Bottom nav disappeared after page reload"
            print(f"  ✓ [{vp_name}] Navigation persistent across hard reload")

            # Capture visual evidence
            os.makedirs("/home/agyops/var/qa/mobile_nav_regression", exist_ok=True)
            shot_path = f"/home/agyops/var/qa/mobile_nav_regression/evidence_{width}x{height}.png"
            await page.screenshot(path=shot_path)
            print(f"  ✓ [{vp_name}] Screenshot captured: {shot_path}")

            await context.close()

        # Step 7: Desktop regression verification (ensure bottom nav is NOT visible on desktop, sidebar is visible)
        print("\n--- Testing Desktop Regression (1440x900) ---")
        d_context = await browser.new_context(viewport={"width": 1440, "height": 900})
        d_page = await d_context.new_page()
        await d_page.goto(f"{BASE_URL}/login")
        await d_page.fill("input[type='email']", test_email)
        await d_page.fill("input[type='password']", test_password)
        await d_page.click("button[type='submit']")
        await d_page.wait_for_url("**/overview*", timeout=10000)

        d_bnav = d_page.locator("nav[aria-label='Mobile Bottom Navigation']")
        assert not await d_bnav.is_visible(), "Bottom nav should NOT be visible on desktop"
        d_sidebar = d_page.locator("aside, nav[aria-label='Main Navigation']")
        assert await d_sidebar.first.is_visible(), "Desktop sidebar must be visible on desktop"
        await d_page.screenshot(path="/home/agyops/var/qa/mobile_nav_regression/evidence_desktop_1440x900.png")
        print("  ✓ Desktop view verified: MobileBottomNav hidden via md:hidden, Sidebar visible")
        await d_context.close()

        await browser.close()
    
    print("\n" + "=" * 80)
    print("ALL MOBILE BOTTOM NAVIGATION TESTS PASSED SUCCESSFULLY!")
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(run_regression_tests())

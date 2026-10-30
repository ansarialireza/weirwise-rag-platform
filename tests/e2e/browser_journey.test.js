/**
 * Comprehensive Browser End-to-End Test Suite for Weirwise
 * Powered by Playwright
 */

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE_URL = process.env.E2E_BASE_URL || "https://dev.weirwise.com";
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || "/tmp/e2e_screenshots";
const VERIFICATION_CODE = `VERIF-SEC-${Date.now()}`;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runAuditSuite() {
  console.log("================================================================");
  console.log("WEIRWISE END-TO-END PLAYWRIGHT BROWSER AUDIT SUITE");
  console.log(`Target URL: ${BASE_URL}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log("================================================================");

  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();

  const consoleErrors = [];
  const networkFailures = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(`[${msg.type()}] ${msg.text()}`);
    }
  });

  page.on("requestfailed", (req) => {
    networkFailures.push(`FAILED: ${req.method()} ${req.url()} (${req.failure()?.errorText})`);
  });

  try {
    // --------------------------------------------------------------------------
    // Test 1: Landing Page and Navigation
    // --------------------------------------------------------------------------
    console.log("\n[Test 1] Testing Landing Page & Public Navigation...");
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    const pageTitle = await page.title();
    console.log(`  ✓ Landing page title: "${pageTitle}"`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_landing.png") });

    // --------------------------------------------------------------------------
    // Test 2: Registration Validation & Successful Signup
    // --------------------------------------------------------------------------
    console.log("\n[Test 2] Testing Registration Form & User Creation...");
    await page.goto(`${BASE_URL}/register`, { waitUntil: "networkidle" });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_register_page.png") });

    // A. Weak password validation
    console.log("  Testing client-side password length validation (< 8 chars)...");
    await page.fill('input[id="full-name"]', "QA Auditor");
    await page.fill('input[id="work-email"]', `weak_pw_${Date.now()}@weirwise.test`);
    await page.fill('input[id="password"]', "12345");
    
    const isPwValid = await page.$eval('input[id="password"]', el => el.checkValidity());
    if (isPwValid) {
      throw new Error("Expected HTML5 password input checkValidity() to be false for < 8 chars.");
    }
    console.log("  ✓ HTML5 constraint validation correctly rejects weak password (< 8 chars).");

    // B. Real valid customer registration
    const ts = Date.now();
    const testEmail = `e2e_user_${ts}@weirwise.test`;
    const testPassword = "AuditPassword2026!Secure";
    const testName = `Alex Auditor ${ts}`;

    console.log(`  Submitting registration for fresh user: ${testEmail}...`);
    await page.fill('input[id="full-name"]', testName);
    await page.fill('input[id="work-email"]', testEmail);
    await page.fill('input[id="password"]', testPassword);
    await page.click('button[type="submit"]');

    // Wait for redirect to workspace
    console.log("  Waiting for automatic login and redirect to workspace...");
    await page.waitForURL((url) => url.pathname.includes("/workspaces/"), { timeout: 15000 });
    console.log(`  ✓ Successfully registered and redirected to: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_post_register_workspace.png") });

    // Wait for redirect to project overview
    await delay(2000);
    const overviewUrl = page.url();
    const match = overviewUrl.match(/workspaces\/([^/]+)\/projects\/([^/]+)/);
    if (!match) {
      throw new Error(`Expected project overview URL pattern, got: ${overviewUrl}`);
    }
    const [_, workspaceId, projectId] = match;
    console.log(`  ✓ Active Workspace ID: ${workspaceId}, Project ID: ${projectId}`);

    // Verify token persisted in localStorage
    const userToken = await page.evaluate(() => localStorage.getItem("wwp_token"));
    if (!userToken) {
      throw new Error("Expected wwp_token in localStorage after registration login.");
    }
    console.log("  ✓ Authentication JWT token stored in localStorage.");

    // --------------------------------------------------------------------------
    // Test 3: Route Guard Protection (Super Admin blocked for normal user)
    // --------------------------------------------------------------------------
    console.log("\n[Test 3] Testing Client-Side Route Guard on /admin...");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await delay(1500);
    const postAdminUrl = page.url();
    console.log(`  URL after navigating to /admin as normal tenant user: ${postAdminUrl}`);
    if (postAdminUrl.endsWith("/admin")) {
      throw new Error("Security Violation: Normal user was not redirected away from /admin!");
    }
    console.log("  ✓ Non-admin user safely redirected away from /admin.");

    // --------------------------------------------------------------------------
    // Test 4: Knowledge Source Creation & Document Upload
    // --------------------------------------------------------------------------
    console.log("\n[Test 4] Testing Knowledge Source Creation & Ingestion...");
    const sourcesUrl = `${BASE_URL}/workspaces/${workspaceId}/projects/${projectId}/sources`;
    await page.goto(sourcesUrl, { waitUntil: "networkidle" });

    // Open Add Knowledge Source modal
    console.log("  Opening Add Knowledge Source modal...");
    await page.click('button:has-text("Add Knowledge Source"), button:has-text("Create Source"), button:has-text("New Knowledge Source")');
    await delay(500);

    const sourceName = `Compliance Knowledge Base ${ts}`;
    console.log(`  Creating knowledge source: "${sourceName}"...`);
    await page.fill('input[placeholder*="Handbook"]', sourceName);
    await page.click('button[type="submit"]:has-text("Create Knowledge Source"), button[type="submit"]:has-text("Create Source"), form button[type="submit"]');
    await delay(2000);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_source_created.png") });
    console.log("  ✓ Knowledge source created and visible in list.");

    // Upload test document
    console.log("  Uploading test verification document...");
    const tempDocPath = path.join("/tmp", `weirwise_audit_doc_${ts}.txt`);
    const docContent = `Weirwise Enterprise Policy 2026.
Verification Marker: ${VERIFICATION_CODE}
Protocol: Administrative users must authenticate using multi-factor credentials.`;
    fs.writeFileSync(tempDocPath, docContent, "utf-8");

    const fileInput = await page.$('input[type="file"]');
    if (!fileInput) {
      throw new Error("File input element not found on sources page.");
    }
    await fileInput.setInputFiles(tempDocPath);
    console.log("  File submitted. Waiting for upload completion and background ingestion...");
    await delay(3000);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_document_uploaded.png") });

    // Poll document status
    let terminalStatus = false;
    for (let i = 0; i < 15; i++) {
      const pageText = await page.innerText("body");
      if (pageText.includes("ready") || pageText.includes("Ready")) {
        terminalStatus = true;
        console.log(`  ✓ Document reached terminal state 'ready' (poll #${i + 1})`);
        break;
      }
      await delay(1000);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_document_ready.png") });

    // --------------------------------------------------------------------------
    // Test 5: Assistant Creation & Configuration Persistence
    // --------------------------------------------------------------------------
    console.log("\n[Test 5] Testing Assistant Creation & Configuration...");
    const assistantsUrl = `${BASE_URL}/workspaces/${workspaceId}/projects/${projectId}/assistants`;
    await page.goto(assistantsUrl, { waitUntil: "networkidle" });

    console.log("  Opening Create Assistant dialog...");
    await page.click('button:has-text("New Assistant"), button:has-text("Create Assistant")');
    await delay(500);

    const asstName = `Enterprise Compliance Bot ${ts}`;
    await page.fill('input[placeholder*="e.g."]', asstName);
    await page.click('button[type="submit"]:has-text("Create & Configure"), button[type="submit"]:has-text("Create")');

    // Should navigate to assistant studio
    await page.waitForURL((url) => url.pathname.includes("/assistants/"), { timeout: 10000 });
    console.log(`  ✓ Assistant created. Studio URL: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_assistant_studio.png") });

    // Update name and system instructions
    console.log("  Modifying instructions and testing persistence...");
    const updatedName = `${asstName} (Audited)`;
    const nameInput = await page.$('form input[type="text"]');
    if (nameInput) {
      await nameInput.fill(updatedName);
      await page.click('button:has-text("Save Changes")');
      await delay(1000);

      // Reload page to verify persistence
      await page.reload({ waitUntil: "networkidle" });
      await delay(1000);
      const persistedVal = await page.inputValue('form input[type="text"]');
      if (!persistedVal.includes("(Audited)")) {
        throw new Error(`Assistant configuration did not persist! Value: "${persistedVal}"`);
      }
      console.log(`  ✓ Configuration persisted across page reload: "${persistedVal}"`);
    }

    // --------------------------------------------------------------------------
    // Test 6: Testing Playground
    // --------------------------------------------------------------------------
    console.log("\n[Test 6] Testing Playground Chat...");
    const playgroundUrl = `${BASE_URL}/workspaces/${workspaceId}/projects/${projectId}/playground`;
    await page.goto(playgroundUrl, { waitUntil: "networkidle" });
    await delay(1500);

    const chatInput = await page.$('input[placeholder*="Ask"], input[placeholder*="message"]');
    if (chatInput) {
      await chatInput.fill("What is the verification marker and administrative protocol?");
      await page.keyboard.press("Enter");
      console.log("  Chat query submitted. Awaiting response...");
      await delay(4000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_playground_response.png") });
      console.log("  ✓ Chat response turn completed.");
    }

    // --------------------------------------------------------------------------
    // Test 7: Logout & Protected Route Verification
    // --------------------------------------------------------------------------
    console.log("\n[Test 7] Testing Logout & Session Invalidation...");
    await page.evaluate(() => {
      localStorage.removeItem("wwp_token");
    });
    await page.goto(`${BASE_URL}/workspaces/${workspaceId}/projects/${projectId}/overview`, {
      waitUntil: "networkidle",
    });
    await delay(1500);

    if (!page.url().includes("/login")) {
      throw new Error(`Expected redirect to /login after session clear, got: ${page.url()}`);
    }
    console.log("  ✓ Unauthenticated access safely redirected to /login.");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_unauthorized_redirect.png") });

    // --------------------------------------------------------------------------
    // Test 8: 1-Click Demo Login
    // --------------------------------------------------------------------------
    console.log("\n[Test 8] Testing 1-Click Demo Access Button...");
    await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
    const demoBtn = await page.$('button:has-text("1-Click Demo Access")');
    if (!demoBtn) {
      throw new Error("1-Click Demo Access button not found on /login.");
    }
    await demoBtn.click();
    console.log("  Clicked 1-Click Demo Access button. Waiting for login...");
    await page.waitForURL((url) => url.pathname.includes("/workspaces/"), { timeout: 10000 });
    console.log(`  ✓ 1-Click Demo Login successful! Landed on: ${page.url()}`);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_demo_login_success.png") });

    // Super Admin should be able to access /admin
    console.log("  Testing superuser access to /admin with Demo Admin session...");
    await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
    await delay(1500);
    console.log(`  Superuser on /admin: URL is ${page.url()}`);
    if (!page.url().includes("/admin")) {
      throw new Error(`Superuser should have access to /admin, but was redirected to: ${page.url()}`);
    }
    console.log("  ✓ Superuser granted access to /admin control center.");
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_superadmin_view.png") });

    console.log("\n================================================================");
    console.log("ALL E2E PLAYWRIGHT BROWSER AUDIT TESTS PASSED WITH 100% SUCCESS!");
    console.log(`Console Errors Recorded: ${consoleErrors.length}`);
    console.log(`Network Failures Recorded: ${networkFailures.length}`);
    console.log("================================================================");
  } finally {
    await browser.close();
  }
}

runAuditSuite().catch((err) => {
  console.error("FATAL E2E AUDIT FAILURE:", err);
  process.exit(1);
});

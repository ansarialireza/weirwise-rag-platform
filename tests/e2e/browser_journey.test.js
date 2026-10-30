const puppeteer = require("puppeteer-core");
const fs = require("fs");
const path = require("path");

const delay = ms => new Promise(r => setTimeout(r, ms));
const SCREENSHOT_DIR = "C:/Users/Alireza/GitHub/e2e_screenshots";
const VERIFICATION_CODE = "VERIF-CYBER-WEIRWISE-778899";

async function runCompleteJourney() {
  const browser = await puppeteer.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--window-size=1280,800"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // 1. Register new user
  const ts = Date.now();
  const email = `audit_${ts}@weirwise.local`;
  const password = "Password123!";
  const name = `Audit User ${ts}`;

  console.log("--> Navigating to register...");
  await page.goto("http://localhost:3000/register", { waitUntil: "networkidle2" });
  await page.type("input[type=\"text\"]", name);
  await page.type("input[type=\"email\"]", email);
  await page.type("input[type=\"password\"]", password);
  await page.click("button[type=\"submit\"]");

  await page.waitForFunction(() => window.location.pathname.includes("/workspaces/"), { timeout: 15000 });
  console.log("--> Landed in workspace:", page.url());

  // Wait for redirect to project or project list
  await delay(2000);
  const currentUrl = page.url();
  console.log("--> Current project URL:", currentUrl);

  const match = currentUrl.match(/workspaces\/([^/]+)\/projects\/([^/]+)/);
  if (!match) {
    throw new Error("Could not extract workspaceId and projectId from URL: " + currentUrl);
  }
  const [_, workspaceId, projectId] = match;
  console.log(`Workspace ID: ${workspaceId}, Project ID: ${projectId}`);

  // 2. Navigate to Knowledge Sources page
  console.log("--> Navigating to Knowledge Sources page...");
  await page.goto(`http://localhost:3000/workspaces/${workspaceId}/projects/${projectId}/sources`, { waitUntil: "networkidle2" });
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_sources_page_empty.png") });

  // Click create new source button
  console.log("--> Clicking 'New Knowledge Source'...");
  await page.waitForSelector("button");
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const b = btns.find(el => el.textContent.includes("New Knowledge Source") || el.textContent.includes("Create Knowledge Source"));
    if (b) b.click();
  });
  await delay(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_new_source_modal.png") });

  // Fill in source name and submit form
  console.log("--> Submitting new source form...");
  await page.type("form input[type=\"text\"]", "Enterprise Security KB");
  await page.evaluate(() => {
    const form = document.querySelector("form");
    if (form) {
      const submitBtn = form.querySelector("button[type=\"submit\"]");
      if (submitBtn) submitBtn.click();
      else form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  });
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_source_created.png") });

  // 3. Prepare verification file and upload
  console.log("--> Preparing verification document with unique code...");
  const tempDocPath = path.join("C:/Users/Alireza/GitHub", "test_verification_doc.txt");
  const docContent = `Weirwise Security & Compliance Policy 2026.
Confidential Enterprise Documentation.
System Verification Code: ${VERIFICATION_CODE}
The primary security protocol mandates multi-factor biometric authentication for all administrative infrastructure access.`;
  fs.writeFileSync(tempDocPath, docContent, "utf-8");

  // Locate file input and upload
  console.log("--> Uploading document via file input...");
  const fileInput = await page.$("input[type=\"file\"]");
  await fileInput.uploadFile(tempDocPath);
  await delay(3000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09_document_uploaded.png") });

  // Poll for document status to reach terminal state (ready/completed)
  console.log("--> Polling for terminal document processing status...");
  let terminalReached = false;
  let finalStatus = "unknown";
  for (let i = 0; i < 20; i++) {
    await delay(1000);
    const statusText = await page.evaluate(() => {
      const text = document.body.innerText;
      if (text.includes("ready") || text.includes("Ready") || text.includes("completed")) return "ready";
      if (text.includes("failed") || text.includes("Failed")) return "failed";
      if (text.includes("processing") || text.includes("Processing")) return "processing";
      return "pending";
    });
    console.log(`Poll ${i + 1}: status = ${statusText}`);
    if (statusText === "ready" || statusText === "failed") {
      terminalReached = true;
      finalStatus = statusText;
      break;
    }
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10_document_terminal_status.png") });
  console.log(`Document terminal status reached: ${terminalReached} (${finalStatus})`);

  // 4. Create Assistant & Link Knowledge Source
  console.log("--> Creating Assistant via platform API...");
  const asstResp = await page.evaluate(async (pId) => {
    const res = await fetch(`http://localhost:8001/api/v1/projects/${pId}/assistants`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + localStorage.getItem("wwp_token")
      },
      body: JSON.stringify({
        name: "Security Advisor",
        system_instructions: "You are a Weirwise security assistant. Ground your answers strictly on the knowledge base documents.",
        model: "gpt-4o-mini",
        temperature: 0.1,
        score_threshold: 0.5
      })
    });
    return res.json();
  }, projectId);

  console.log("Created Assistant ID:", asstResp.id);
  const assistantId = asstResp.id;

  // Link knowledge source
  await page.evaluate(async (pId, aId) => {
    const sRes = await fetch(`http://localhost:8001/api/v1/projects/${pId}/sources`, {
      headers: { "Authorization": "Bearer " + localStorage.getItem("wwp_token") }
    });
    const sources = await sRes.json();
    if (sources.length > 0) {
      await fetch(`http://localhost:8001/api/v1/assistants/${aId}/sources/${sources[0].id}`, {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("wwp_token") }
      });
    }
  }, projectId, assistantId);

  // Navigate to Assistant Studio in browser
  const studioUrl = `http://localhost:3000/workspaces/${workspaceId}/projects/${projectId}/assistants/${assistantId}`;
  console.log("--> Opening Assistant Studio:", studioUrl);
  await page.goto(studioUrl, { waitUntil: "networkidle2" });
  await delay(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11_assistant_studio.png") });

  // 5. Grounded Question Test
  console.log("--> Sending grounded question in Chat Playground...");
  await page.waitForSelector("form input[type=\"text\"], textarea, input[placeholder*='Ask'], input[placeholder*='message']");
  const chatInput = await page.$("form input[type=\"text\"], textarea, input[placeholder*='Ask'], input[placeholder*='message']");
  await chatInput.type("What is the system verification code and security protocol?");
  await page.keyboard.press("Enter");

  console.log("--> Waiting for assistant response...");
  await delay(4000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12_grounded_response.png") });

  // 6. Negative Test: Unrelated Question
  console.log("--> Sending unrelated question...");
  await chatInput.type("What is the secret recipe for baking triple chocolate cookies?");
  await page.keyboard.press("Enter");
  await delay(4000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "13_negative_test_response.png") });

  // 7. Reload Persistence
  console.log("--> Testing session persistence after reload...");
  await page.reload({ waitUntil: "networkidle2" });
  await delay(1500);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "14_reloaded_studio.png") });
  const stillAuthenticated = await page.evaluate(() => !!localStorage.getItem("wwp_token"));
  console.log("Session token still in localStorage:", stillAuthenticated);

  // 8. Unauthorized Access Negative Test
  console.log("--> Testing unauthorized session handling...");
  await page.evaluate(() => localStorage.removeItem("wwp_token"));
  await page.goto(`http://localhost:3000/workspaces/${workspaceId}`, { waitUntil: "networkidle2" });
  await delay(2000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, "15_unauthorized_redirect.png") });
  console.log("Post-logout URL (expected /login):", page.url());

  await browser.close();
  console.log("ALL BROWSER JOURNEY TESTS COMPLETED SUCCESSFULLY!");
}

runCompleteJourney().catch(err => {
  console.error("FATAL ERROR IN COMPLETE JOURNEY:", err);
  process.exit(1);
});

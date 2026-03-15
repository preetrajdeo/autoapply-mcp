// src/lib/browser.ts
// Manages a single shared Playwright browser instance per session.
// Each API-key-scoped call gets its own page (tab) so multiple users don't collide.

import { chromium, Browser, Page } from "playwright";

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    const launchOptions: Parameters<typeof chromium.launch>[0] = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
    };
    // On Railway/Linux, use the system Chromium installed via apt
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    browser = await chromium.launch(launchOptions);
  }
  return browser;
}

// Active pages keyed by session id (api key hash)
const pages = new Map<string, Page>();

export async function getPage(sessionId: string): Promise<Page> {
  const b = await getBrowser();
  if (!pages.has(sessionId) || pages.get(sessionId)!.isClosed()) {
    const ctx = await b.newContext({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      viewport: { width: 1280, height: 900 },
    });
    const page = await ctx.newPage();
    pages.set(sessionId, page);
  }
  return pages.get(sessionId)!;
}

export async function closePage(sessionId: string): Promise<void> {
  const page = pages.get(sessionId);
  if (page && !page.isClosed()) {
    await page.context().close();
  }
  pages.delete(sessionId);
}

export async function screenshot(page: Page): Promise<string> {
  const buf = await page.screenshot({ type: "png", fullPage: false });
  return buf.toString("base64");
}

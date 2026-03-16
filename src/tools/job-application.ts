// src/tools/job-application.ts
// MCP tools for navigating, filling, and reviewing job applications.

import { z } from "zod";
import { getPage, closePage, screenshot } from "../lib/browser.js";
import { fillForm, fillAnswer, uploadResumeFiles } from "../lib/filler.js";
import type { Profile } from "../lib/filler.js";

// ── open_job_application ──────────────────────────────────────────────────────

export const openJobApplicationSchema = z.object({
  url:        z.string().url().describe("Full URL of the job application page"),
  session_id: z.string().describe("Your session ID (same as API key)"),
});

export async function openJobApplication(input: z.infer<typeof openJobApplicationSchema>) {
  const page = await getPage(input.session_id);
  await page.goto(input.url, { waitUntil: "networkidle", timeout: 30_000 });
  // Let React/SPA settle
  await page.waitForTimeout(1500);
  const title  = await page.title();
  const img    = await screenshot(page);
  return {
    success: true,
    page_title: title,
    url: page.url(),
    screenshot_base64: img,
    message: "Page loaded. Call fill_known_fields next to auto-fill all mapped fields.",
  };
}

// ── fill_known_fields ─────────────────────────────────────────────────────────

export const fillKnownFieldsSchema = z.object({
  session_id: z.string().describe("Your session ID"),
  profile:    z.record(z.unknown()).describe("User profile JSON (from get_profile or save_profile)"),
});

export async function fillKnownFields(input: z.infer<typeof fillKnownFieldsSchema>) {
  const page = await getPage(input.session_id);
  const profile = input.profile as Profile;
  const result = await fillForm(page, profile);

  // Upload resume to any file input fields if stored in profile
  let resumeUploaded = 0;
  if (profile.resume_file) {
    resumeUploaded = await uploadResumeFiles(page, profile.resume_file);
  }

  await page.waitForTimeout(500);
  const img = await screenshot(page);

  const filledCount  = result.filled.filter(f => f.status === "filled").length;
  const failedFields = result.filled.filter(f => f.status === "failed").map(f => f.label);

  return {
    success: true,
    filled_count: filledCount,
    resume_uploaded: resumeUploaded > 0,
    failed_fields: failedFields,
    unique_questions: result.uniqueQuestions,
    screenshot_base64: img,
    message: `Filled ${filledCount} fields${resumeUploaded > 0 ? ", uploaded resume" : ""}. ${(result.uniqueQuestions ?? []).length} questions need your answers.`,
  };
}

// ── fill_answer ───────────────────────────────────────────────────────────────

export const fillAnswerSchema = z.object({
  session_id: z.string().describe("Your session ID"),
  selector:   z.string().describe("CSS selector for the field (from unique_questions)"),
  answer:     z.string().describe("The answer text to fill in"),
});

export async function fillOneAnswer(input: z.infer<typeof fillAnswerSchema>) {
  const page = await getPage(input.session_id);
  const ok   = await fillAnswer(page, input.selector, input.answer);
  await page.waitForTimeout(300);
  const img  = await screenshot(page);
  return {
    success: ok,
    screenshot_base64: img,
    message: ok ? `Filled answer into ${input.selector}` : `Could not find field ${input.selector}`,
  };
}

// ── take_screenshot ───────────────────────────────────────────────────────────

export const takeScreenshotSchema = z.object({
  session_id: z.string().describe("Your session ID"),
});

export async function takeScreenshot(input: z.infer<typeof takeScreenshotSchema>) {
  const page = await getPage(input.session_id);
  const img  = await screenshot(page);
  return { screenshot_base64: img };
}

// ── scroll_page ───────────────────────────────────────────────────────────────

export const scrollPageSchema = z.object({
  session_id: z.string().describe("Your session ID"),
  direction:  z.enum(["down", "up"]).default("down"),
  amount:     z.number().int().min(100).max(5000).default(800).describe("Pixels to scroll"),
});

export async function scrollPage(input: z.infer<typeof scrollPageSchema>) {
  const page = await getPage(input.session_id);
  await page.evaluate(({ dir, amt }) => {
    window.scrollBy(0, dir === "down" ? amt : -amt);
  }, { dir: input.direction, amt: input.amount });
  await page.waitForTimeout(300);
  const img = await screenshot(page);
  return { screenshot_base64: img };
}

// ── close_session ─────────────────────────────────────────────────────────────

export const closeSessionSchema = z.object({
  session_id: z.string().describe("Your session ID"),
});

export async function closeSession(input: z.infer<typeof closeSessionSchema>) {
  await closePage(input.session_id);
  return { success: true, message: "Browser session closed." };
}

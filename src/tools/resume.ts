// src/tools/resume.ts
// Upload and parse a resume PDF, extract profile fields, store raw file.

import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { loadProfile, saveProfile } from "../lib/storage.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const uploadResumeSchema = z.object({
  session_id:      z.string().describe("Your API key"),
  filename:        z.string().describe("Original filename, e.g. resume.pdf"),
  content_base64:  z.string().describe("Base64-encoded file content"),
  content_type:    z.enum(["application/pdf"])
    .describe("Only PDF is supported. Convert Word docs to PDF first."),
});

// Fields that a resume never contains — always ask the user for these.
const ALWAYS_MISSING = [
  "Work authorization (are you legally authorized to work in the US?)",
  "Visa sponsorship (do you require sponsorship now or in the future?)",
  "Preferred salary range",
  "Auto-submit preference (should I submit applications automatically, or pause for your review?)",
  "Batch mode preference (should I move through multiple job URLs automatically, or pause between each?)",
];

// Fields we try to extract — used to build the "still missing" list.
const EXTRACTABLE_FIELDS: Array<{ key: string; label: string }> = [
  { key: "personal.firstName",   label: "First name" },
  { key: "personal.lastName",    label: "Last name" },
  { key: "personal.email",       label: "Email" },
  { key: "personal.phone",       label: "Phone" },
  { key: "personal.linkedIn",    label: "LinkedIn URL" },
  { key: "personal.github",      label: "GitHub URL" },
  { key: "personal.portfolio",   label: "Portfolio URL" },
  { key: "personal.address.city",    label: "City" },
  { key: "personal.address.state",   label: "State" },
  { key: "personal.address.country", label: "Country" },
  { key: "education",            label: "Education" },
];

function getNestedValue(obj: Record<string, unknown>, dotPath: string): unknown {
  return dotPath.split(".").reduce((cur: unknown, key) => {
    if (cur && typeof cur === "object") return (cur as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) {
      if (
        typeof v === "object" && !Array.isArray(v) &&
        typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k])
      ) {
        result[k] = deepMerge(
          result[k] as Record<string, unknown>,
          v as Record<string, unknown>,
        );
      } else {
        result[k] = v;
      }
    }
  }
  return result;
}

export async function uploadResume(input: z.infer<typeof uploadResumeSchema>) {
  // ── 1. Parse resume with Claude ─────────────────────────────────────────
  const response = await anthropic.messages.create({
    model: "claude-opus-4-6",
    max_tokens: 1024,
    messages: [{
      role: "user",
      content: [{
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: input.content_base64,
        },
      } as any, {
        type: "text",
        text: `Extract job application profile information from this resume.
Return ONLY a valid JSON object using this exact schema (omit fields not found):
{
  "personal": {
    "firstName": "",
    "lastName": "",
    "email": "",
    "phone": "",
    "linkedIn": "",
    "github": "",
    "portfolio": "",
    "address": { "city": "", "state": "", "country": "" }
  },
  "education": [{ "degree": "", "institution": "" }]
}
Return only the JSON. No markdown fences, no explanation.`,
      }],
    }],
  });

  let extracted: Record<string, unknown> = {};
  try {
    const raw = (response.content[0] as any).text.trim();
    extracted = JSON.parse(raw);
  } catch {
    return {
      success: false,
      message: "Could not parse resume. Make sure it's a readable PDF (not a scanned image).",
    };
  }

  // ── 2. Store raw file + merge extracted data into profile ────────────────
  const existing = (await loadProfile(input.session_id)) ?? {};
  const merged = deepMerge(existing, {
    ...extracted,
    resume_file: {
      filename:       input.filename,
      content_base64: input.content_base64,
      content_type:   input.content_type,
    },
  });
  await saveProfile(input.session_id, merged);

  // ── 3. Build "still missing" list from extractable fields ────────────────
  const missingFromResume = EXTRACTABLE_FIELDS
    .filter(({ key }) => {
      const val = getNestedValue(merged, key);
      if (Array.isArray(val)) return val.length === 0;
      return !val;
    })
    .map(({ label }) => label);

  // ── 4. Build human-readable confirmation summary ─────────────────────────
  const p = (merged.personal ?? {}) as Record<string, unknown>;
  const addr = (p.address ?? {}) as Record<string, unknown>;
  const edu  = (merged.education ?? []) as Array<Record<string, unknown>>;

  const summaryLines = [
    `**Name:** ${[p.firstName, p.lastName].filter(Boolean).join(" ") || "—"}`,
    `**Email:** ${p.email || "—"}`,
    `**Phone:** ${p.phone || "—"}`,
    `**LinkedIn:** ${p.linkedIn || "—"}`,
    `**GitHub:** ${p.github || "—"}`,
    `**Portfolio:** ${p.portfolio || "—"}`,
    `**Location:** ${[addr.city, addr.state, addr.country].filter(Boolean).join(", ") || "—"}`,
    `**Education:** ${edu.map(e => [e.degree, e.institution].filter(Boolean).join(" @ ")).join("; ") || "—"}`,
  ];

  return {
    success: true,
    message: "Resume parsed and profile updated.",
    confirmation_summary: summaryLines.join("\n"),
    missing_from_resume: missingFromResume,
    always_need_to_ask: ALWAYS_MISSING,
  };
}

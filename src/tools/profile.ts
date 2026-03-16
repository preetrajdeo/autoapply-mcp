// src/tools/profile.ts
// MCP tools for saving and retrieving user profile data.

import { z } from "zod";
import { saveProfile, loadProfile, generateApiKey, registerKey } from "../lib/storage.js";

// ── register (get an API key) ─────────────────────────────────────────────────

export const registerSchema = z.object({});

export async function register(_input: z.infer<typeof registerSchema>) {
  const key = generateApiKey();
  await registerKey(key);
  return {
    api_key: key,
    message: "Save this API key — use it as your session_id in all other tools. Call save_profile next.",
  };
}

// ── save_profile ──────────────────────────────────────────────────────────────

export const saveProfileSchema = z.object({
  session_id: z.string().describe("Your API key from register"),
  profile: z.object({
    personal: z.object({
      firstName:         z.string().optional(),
      lastName:          z.string().optional(),
      email:             z.string().email().optional(),
      phone:             z.string().optional(),
      linkedIn:          z.string().url().optional(),
      github:            z.string().url().optional(),
      portfolio:         z.string().url().optional(),
      willingToRelocate: z.boolean().optional().default(true),
      hearAbout:         z.string().optional().default("LinkedIn"),
      address: z.object({
        street:  z.string().optional(),
        city:    z.string().optional(),
        state:   z.string().optional(),
        zip:     z.string().optional(),
        country: z.string().optional().default("United States"),
      }).optional(),
    }).optional(),
    demographics: z.object({
      gender:               z.string().optional(),
      ethnicity:            z.string().optional(),
      veteranStatus:        z.string().optional(),
      disabilityStatus:     z.string().optional(),
      requiresSponsorship:  z.boolean().optional().default(false),
      authorizedToWork:     z.boolean().optional().default(true),
    }).optional(),
    education: z.array(z.object({
      degree:      z.string().optional(),
      institution: z.string().optional(),
    })).optional(),
    salary: z.object({
      desiredMin: z.string().optional(),
    }).optional(),
  }).describe("Your job application profile"),
});

// Deep-merge: plain objects are merged recursively; arrays and primitives replace.
function deepMerge(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null) {
      if (
        typeof v === "object" && !Array.isArray(v) &&
        typeof result[k] === "object" && result[k] !== null && !Array.isArray(result[k])
      ) {
        result[k] = deepMerge(result[k] as Record<string, unknown>, v as Record<string, unknown>);
      } else {
        result[k] = v;
      }
    }
  }
  return result;
}

export async function saveUserProfile(input: z.infer<typeof saveProfileSchema>) {
  const existing = (await loadProfile(input.session_id)) ?? {};
  const merged = deepMerge(existing, input.profile as Record<string, unknown>);
  await saveProfile(input.session_id, merged);
  return {
    success: true,
    message: "Profile saved. You can now call fill_known_fields with any job URL.",
  };
}

// ── save_field_mapping ────────────────────────────────────────────────────────

export const saveFieldMappingSchema = z.object({
  session_id: z.string().describe("Your API key"),
  pattern: z.string().describe("Label text to match (e.g. 'us citizen', 'located in san francisco bay area')"),
  value: z.string().describe("Answer to always fill for this field (e.g. 'Yes', 'No', 'San Francisco')"),
});

export async function saveFieldMapping(input: z.infer<typeof saveFieldMappingSchema>) {
  const profile = (await loadProfile(input.session_id)) ?? {};
  const mappings: Array<{ pattern: string; value: string }> =
    (profile.custom_mappings as any) ?? [];

  // Update existing pattern or add new
  const idx = mappings.findIndex(m => m.pattern.toLowerCase() === input.pattern.toLowerCase());
  if (idx >= 0) mappings[idx].value = input.value;
  else mappings.push({ pattern: input.pattern, value: input.value });

  await saveProfile(input.session_id, { ...profile, custom_mappings: mappings });
  return {
    success: true,
    message: `Saved: "${input.pattern}" → "${input.value}". Total custom mappings: ${mappings.length}.`,
    all_mappings: mappings,
  };
}

// ── get_profile ───────────────────────────────────────────────────────────────

export const getProfileSchema = z.object({
  session_id: z.string().describe("Your API key"),
});

export async function getUserProfile(input: z.infer<typeof getProfileSchema>) {
  const profile = await loadProfile(input.session_id);
  if (!profile) {
    return { success: false, message: "No profile found. Call save_profile first." };
  }
  return { success: true, profile };
}

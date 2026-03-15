// src/tools/profile.ts
// MCP tools for saving and retrieving user profile data.

import { z } from "zod";
import { saveProfile, loadProfile, generateApiKey, registerKey } from "../lib/storage.js";

// ── register (get an API key) ─────────────────────────────────────────────────

export const registerSchema = z.object({});

export async function register(_input: z.infer<typeof registerSchema>) {
  const key = generateApiKey();
  registerKey(key);
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

export async function saveUserProfile(input: z.infer<typeof saveProfileSchema>) {
  saveProfile(input.session_id, input.profile as Record<string, unknown>);
  return {
    success: true,
    message: "Profile saved. You can now call fill_known_fields with any job URL.",
  };
}

// ── get_profile ───────────────────────────────────────────────────────────────

export const getProfileSchema = z.object({
  session_id: z.string().describe("Your API key"),
});

export async function getUserProfile(input: z.infer<typeof getProfileSchema>) {
  const profile = loadProfile(input.session_id);
  if (!profile) {
    return { success: false, message: "No profile found. Call save_profile first." };
  }
  return { success: true, profile };
}

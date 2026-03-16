// src/index.ts
// AutoApply MCP Server — HTTP/SSE transport for Railway deployment.
// Compatible with Claude Desktop, Claude Code, and Claude.ai connectors.

import express from "express";
import { randomUUID } from "crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import {
  openJobApplicationSchema, openJobApplication,
  fillKnownFieldsSchema,    fillKnownFields,
  fillAnswerSchema,          fillOneAnswer,
  takeScreenshotSchema,      takeScreenshot,
  scrollPageSchema,          scrollPage,
  closeSessionSchema,        closeSession,
} from "./tools/job-application.js";

import {
  registerSchema,           register,
  saveProfileSchema,        saveUserProfile,
  getProfileSchema,         getUserProfile,
  saveFieldMappingSchema,   saveFieldMapping,
} from "./tools/profile.js";

// ── MCP Server ────────────────────────────────────────────────────────────────

function createMcpServer(): McpServer {
  const server = new McpServer({
    name:    "AutoApply",
    version: "1.0.0",
  });

  // ── Profile tools ──────────────────────────────────────────────────────────
  server.tool(
    "register",
    "Get a new API key / session ID. Call this once before using any other tools.",
    registerSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (input) => {
      const result = await register(input);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "save_profile",
    "Save your job application profile (name, email, phone, address, work auth, etc.). " +
    "Stored server-side keyed to your session_id.",
    saveProfileSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (input) => {
      const result = await saveUserProfile(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_profile",
    "Retrieve your saved profile to review or update it.",
    getProfileSchema.shape,
    { readOnlyHint: true },
    async (input) => {
      const result = await getUserProfile(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "save_field_mapping",
    "Teach AutoApply how to answer a recurring question. " +
    "Provide the label pattern (partial match is fine) and the answer to always use. " +
    "Example: pattern='located in san francisco', value='Yes'. " +
    "Next time fill_known_fields sees that label, it fills it automatically.",
    saveFieldMappingSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (input) => {
      const result = await saveFieldMapping(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Job application tools ──────────────────────────────────────────────────
  server.tool(
    "open_job_application",
    "Open a job application URL in a browser and return a screenshot. " +
    "Always call this before fill_known_fields.",
    openJobApplicationSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (input) => {
      const result = await openJobApplication(input as any);
      const { screenshot_base64, ...rest } = result;
      return {
        content: [
          { type: "text",  text: JSON.stringify(rest, null, 2) },
          { type: "image", data: screenshot_base64, mimeType: "image/png" },
        ],
      };
    }
  );

  server.tool(
    "fill_known_fields",
    "Auto-fill all mapped fields (name, email, phone, dropdowns, etc.) from your saved profile. " +
    "Returns a screenshot and a list of unique questions that need AI answers.",
    fillKnownFieldsSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (input) => {
      const result = await fillKnownFields(input as any);
      const { screenshot_base64, ...rest } = result;
      return {
        content: [
          { type: "text",  text: JSON.stringify(rest, null, 2) },
          { type: "image", data: screenshot_base64, mimeType: "image/png" },
        ],
      };
    }
  );

  server.tool(
    "fill_answer",
    "Fill a specific answer into one field. Use the selector from unique_questions returned by fill_known_fields. " +
    "Call this once per unique question after generating each answer.",
    fillAnswerSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    async (input) => {
      const result = await fillOneAnswer(input as any);
      const { screenshot_base64, ...rest } = result;
      return {
        content: [
          { type: "text",  text: JSON.stringify(rest, null, 2) },
          { type: "image", data: screenshot_base64, mimeType: "image/png" },
        ],
      };
    }
  );

  server.tool(
    "take_screenshot",
    "Take a screenshot of the current state of the job application page.",
    takeScreenshotSchema.shape,
    { readOnlyHint: true },
    async (input) => {
      const result = await takeScreenshot(input as any);
      return {
        content: [
          { type: "image", data: result.screenshot_base64, mimeType: "image/png" },
        ],
      };
    }
  );

  server.tool(
    "scroll_page",
    "Scroll the job application page up or down to reveal more fields.",
    scrollPageSchema.shape,
    { readOnlyHint: true },
    async (input) => {
      const result = await scrollPage(input as any);
      return {
        content: [
          { type: "image", data: result.screenshot_base64, mimeType: "image/png" },
        ],
      };
    }
  );

  server.tool(
    "close_session",
    "Close the browser session when done. Always call this after submitting or abandoning.",
    closeSessionSchema.shape,
    { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    async (input) => {
      const result = await closeSession(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Prompts ────────────────────────────────────────────────────────────────

  server.prompt(
    "onboard",
    "First-time setup: introduces AutoApply and collects your profile + preferences",
    {},
    () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `Hey! I'd like to set up AutoApply.`,
        },
      }, {
        role: "assistant",
        content: {
          type: "text",
          text: `Hey! Welcome to **AutoApply** — I handle the tedious work of job applications so you can focus on what matters.

Here's how it works:
1. You tell me about yourself once — name, email, phone, address, work authorization, and anything else relevant
2. You paste one job application URL (or a whole batch at once)
3. I open each one in a real browser, fill all the standard fields automatically, and bring back any open-ended questions for you to answer
4. You review a screenshot and give the go-ahead

Before I save your profile, two quick questions:

**1. Auto-submit** — After I've filled a form and you've answered the open questions, should I submit the application automatically? Or would you prefer to review a final screenshot and explicitly say "submit" each time?

**2. Batch mode** — If you paste multiple job links, should I work through them one by one automatically? Or pause between each application so you can confirm before I move on?

Once you answer those, tell me your details and I'll get everything saved.`,
        },
      }],
    })
  );

  server.prompt(
    "start_applying",
    "Kick off a job application session — paste one or more job URLs to begin",
    {},
    () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: `I'd like to start applying to jobs.`,
        },
      }, {
        role: "assistant",
        content: {
          type: "text",
          text: `Ready to go! Paste your job application URL(s) — one per line is fine — and I'll get started.

I'll open each one, auto-fill everything from your saved profile, and come back to you with:
- A screenshot so you can see what was filled
- Any open-ended questions the form is asking that need a personal answer

If you haven't set up your profile yet, say "onboard me" first and I'll walk you through it.`,
        },
      }],
    })
  );

  return server;
}

// ── Express app ───────────────────────────────────────────────────────────────

const app = express();

// Health (no body parsing needed)
app.get("/health", (_req, res) => res.json({ status: "ok", name: "AutoApply MCP" }));

// ── Legacy SSE transport (used by mcp-remote) ─────────────────────────────────
// Register BEFORE express.json() so SSEServerTransport reads the raw body itself.
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
const sseTransports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  res.setHeader("X-Accel-Buffering", "no");
  const transport = new SSEServerTransport("/messages", res);
  const server    = createMcpServer();
  sseTransports[transport.sessionId] = transport;
  res.on("close", () => { delete sseTransports[transport.sessionId]; });
  await server.connect(transport);
});

// ── JSON body parsing for all remaining routes ────────────────────────────────
app.use(express.json());

app.post("/messages", async (req, res) => {
  const transport = sseTransports[req.query.sessionId as string];
  if (!transport) { res.status(404).json({ error: "Session not found" }); return; }
  // Use handleMessage directly with the pre-parsed body to avoid raw-body stream issues
  await transport.handleMessage(req.body);
  res.writeHead(202).end("Accepted");
});

// ── Streamable HTTP transport (modern MCP protocol) ──────────────────────────
const sessions: Record<string, StreamableHTTPServerTransport> = {};

app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  if (req.method === "POST" && !sessionId) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => { sessions[id] = transport; },
    });
    transport.onclose = () => {
      if (transport.sessionId) delete sessions[transport.sessionId];
    };
    const server = createMcpServer();
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    return;
  }

  if (sessionId && sessions[sessionId]) {
    await sessions[sessionId].handleRequest(req, res, req.body);
    return;
  }

  res.status(400).json({ error: "Bad request" });
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`AutoApply MCP server running on port ${PORT}`);
});

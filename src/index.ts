// src/index.ts
// AutoApply MCP Server — HTTP/SSE transport for Railway deployment.
// Compatible with Claude Desktop, Claude Code, and Claude.ai connectors.

import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

import {
  openJobApplicationSchema, openJobApplication,
  fillKnownFieldsSchema,    fillKnownFields,
  fillAnswerSchema,          fillOneAnswer,
  takeScreenshotSchema,      takeScreenshot,
  scrollPageSchema,          scrollPage,
  closeSessionSchema,        closeSession,
} from "./tools/job-application.js";

import {
  registerSchema,       register,
  saveProfileSchema,    saveUserProfile,
  getProfileSchema,     getUserProfile,
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
    async (input) => {
      const result = await saveUserProfile(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_profile",
    "Retrieve your saved profile to review or update it.",
    getProfileSchema.shape,
    async (input) => {
      const result = await getUserProfile(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  // ── Job application tools ──────────────────────────────────────────────────
  server.tool(
    "open_job_application",
    "Open a job application URL in a browser and return a screenshot. " +
    "Always call this before fill_known_fields.",
    openJobApplicationSchema.shape,
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
    async (input) => {
      const result = await closeSession(input as any);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  return server;
}

// ── Express + SSE transport ───────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Health check (Railway uses this)
app.get("/health", (_req, res) => res.json({ status: "ok", name: "AutoApply MCP" }));

// One SSE connection per client
const transports: Record<string, SSEServerTransport> = {};

app.get("/sse", async (req, res) => {
  const transport = new SSEServerTransport("/messages", res);
  const server    = createMcpServer();
  transports[transport.sessionId] = transport;

  res.on("close", () => {
    delete transports[transport.sessionId];
  });

  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  const sessionId  = req.query.sessionId as string;
  const transport  = transports[sessionId];
  if (!transport) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  await transport.handlePostMessage(req, res);
});

const PORT = parseInt(process.env.PORT ?? "3000", 10);
app.listen(PORT, () => {
  console.log(`AutoApply MCP server running on port ${PORT}`);
  console.log(`SSE endpoint: http://localhost:${PORT}/sse`);
});

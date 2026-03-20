# AutoApply MCP

An MCP server that automates job applications using a real browser. Give Claude a job posting URL and it fills the entire form — text fields, dropdowns, work authorization, demographics — and surfaces only the questions that need a personal touch.

**Live server:** https://autoapply-mcp.onrender.com
**GitHub:** https://github.com/preetrajdeo/autoapply-mcp

---

## Setup (2 minutes)

### Prerequisites
- [Claude Desktop](https://claude.ai/download) installed
- [Node.js](https://nodejs.org) installed — verify with `node --version` in your terminal

### Option A — Smithery (easiest)

```bash
npx -y @smithery/cli mcp add preetrajdeo/autoapply-mcp
```

This automatically updates your Claude Desktop config and restarts the connection. Done.

### Option B — Manual config

1. Open your Claude Desktop config file:
   - **Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

   > **Can't find the file on Mac?** Open Finder → press `Cmd+Shift+G` → paste `~/Library/Application Support/Claude/` → open `claude_desktop_config.json` in any text editor.

2. Paste the following (merge with any existing content — don't replace the whole file):

```json
{
  "mcpServers": {
    "autoapply": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://autoapply-mcp.onrender.com/sse"]
    }
  }
}
```

3. **Fully quit Claude Desktop** (Cmd+Q on Mac, not just close the window) and reopen it.

4. Start a new conversation — AutoApply tools will be available automatically.

---

## First-time setup — Profile onboarding

Once connected, type this in Claude Desktop:

```
Set up AutoApply for me
```

Claude will ask you to upload your resume (PDF), pull out everything it can automatically, ask for any missing details, show you a full summary, and save your profile once you confirm. You only do this once — your profile is stored server-side and reused for every application.

> **Note:** If Claude doesn't respond with the onboarding flow, try: *"Use the AutoApply onboard prompt"*

---

## Applying to a job

```
Apply to this job for me: https://job-boards.greenhouse.io/acme/jobs/12345
```

Claude will:
1. Open the URL in a real browser
2. Fill all standard fields from your profile (name, email, phone, work auth, demographics, etc.)
3. Auto-upload your resume to any file upload fields
4. Return the open-ended questions for Claude to answer on your behalf
5. Show you a screenshot of the completed form before submitting

### Applying in bulk

```
Apply to all of these for me:
https://job-boards.greenhouse.io/acme/jobs/111
https://lever.co/beta/jobs/222
https://jobs.ashbyhq.com/gamma/333
```

Claude will work through them one by one, pausing between each for your review (or automatically if you set batch mode during onboarding).

---

## Tools reference

| Tool | Description |
|------|-------------|
| `register` | Get an API key / session ID. Called automatically during onboarding. |
| `upload_resume` | Upload a PDF resume to auto-populate your profile. Parses with Claude, shows a confirmation summary before saving. |
| `save_profile` | Save or update profile details (name, email, phone, address, work auth, demographics, salary, preferences). Always merges — never overwrites fields you don't mention. |
| `get_profile` | Retrieve your saved profile to review or verify it. |
| `save_field_mapping` | Teach AutoApply to auto-answer a recurring question. Example: pattern `located in san francisco` → answer `Yes`. |
| `open_job_application` | Open a job URL in a real Chromium browser. Always call before `fill_known_fields`. |
| `fill_known_fields` | Auto-fill all fields from your profile. Returns a screenshot + list of open-ended questions. Also auto-uploads your resume to any file input fields. |
| `fill_answer` | Fill a specific answer into one field (use CSS selector returned by `fill_known_fields`). |
| `take_screenshot` | Screenshot the current state of the page. |
| `scroll_page` | Scroll up or down to reveal more fields. |
| `close_session` | Close the browser session after submitting or abandoning an application. |

---

## Troubleshooting

**"AutoApply tools don't appear in Claude"**
- Make sure you fully quit Claude Desktop (Cmd+Q on Mac), not just closed the window
- Verify Node.js is installed: `node --version` in terminal
- Check the config file is valid JSON (no trailing commas, proper quotes)

**Connection times out on first use**
- The server sleeps after 15 minutes of inactivity (free tier). Wait 30 seconds and try again — it wakes up automatically and stays fast after that.

**"Session not found" error**
- Your browser session expired. Call `open_job_application` again to start a new one.

**Resume not uploading**
- Only PDF is supported. If your resume is a Word doc, export it as PDF first.

---

## How it works

```
Claude Desktop
     |
     | stdio (mcp-remote bridge)
     v
SSE  →  AutoApply MCP Server  (Express + @modelcontextprotocol/sdk)
              |
              | Playwright
              v
        Real Chromium browser  →  Job application page
```

Field filling uses `Object.getOwnPropertyDescriptor` to set React-controlled input values and dispatches synthetic `input`, `change`, and `blur` events — so frameworks like Greenhouse (React-Select) register the change correctly. React fiber tree traversal is used to find and invoke `selectOption()` on dropdown components.

---

## Self-hosting

### Deploy to Render (recommended)

The repo includes a `render.yaml`. Click "New Web Service" in Render, connect the repo, and add these environment variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for resume parsing) | Your Anthropic API key |
| `DATABASE_URL` | Recommended | PostgreSQL connection string for persistent profile storage. Without this, profiles are stored on the local filesystem and wiped on restart. |

### Local development

```bash
npm install
npx playwright install chromium
npm run dev   # starts at http://localhost:3000
```

Point Claude Desktop at `http://localhost:3000/sse` during development.

---

## Built with

- TypeScript · Express · Playwright · @modelcontextprotocol/sdk · @anthropic-ai/sdk

# AutoApply MCP

An MCP server that automates job applications using a real browser. Give Claude a job posting URL and it fills the entire form — text fields, dropdowns, work authorization, demographics — and surfaces the open-ended questions for Claude to answer on your behalf.

Live server: https://autoapply-mcp.onrender.com
GitHub: https://github.com/preetrajdeo/autoapply-mcp

## What it does

1. Opens the job application URL in a Playwright-controlled browser
2. Reads your saved profile (name, email, phone, address, work authorization, demographics, salary)
3. Auto-fills every field it recognizes, including React-Select dropdowns used by Greenhouse, Lever, and Ashby
4. Returns the remaining unique/open-ended questions to Claude
5. Claude generates answers and fills them one by one
6. You see a screenshot of the completed form before submitting

Supported platforms: Greenhouse, Lever, Workday, LinkedIn Easy Apply, and generic HTML forms.

---

## Quick Start — Claude Desktop

Add the following to your `claude_desktop_config.json` (no installation required):

```json
{
  "mcpServers": {
    "autoapply": {
      "command": "npx",
      "args": ["mcp-remote", "https://autoapply-mcp.onrender.com/sse"]
    }
  }
}
```

Restart Claude Desktop. The AutoApply tools will appear automatically.

### First-time setup (say this to Claude)

```
Register me for AutoApply, then save my profile:
  Name: Jane Smith
  Email: jane@example.com
  Phone: +1 415 555 0100
  City: San Francisco, CA
  Authorized to work in the US: yes
  Does not require sponsorship
```

Claude calls `register` once to get your session ID, then `save_profile` to store your info server-side. You only need to do this once.

### Applying to a job

```
Apply to this job for me: https://job-boards.greenhouse.io/acme/jobs/12345
```

Claude will open the URL, fill all standard fields, answer the essay questions, and show you a screenshot of the completed form.

---

## Tools reference

| Tool | Description |
|------|-------------|
| `register` | Get an API key / session ID. Call once before using any other tool. |
| `save_profile` | Save name, email, phone, address, work authorization, demographics, and salary expectations. Stored server-side, keyed to your session ID. |
| `get_profile` | Retrieve your saved profile to review or update it. |
| `save_field_mapping` | Teach AutoApply to auto-answer a recurring question. Provide a label pattern and the answer to always use. Example: pattern `located in san francisco` → `Yes`. |
| `open_job_application` | Open a job URL in a browser and return a screenshot. Always call this before `fill_known_fields`. |
| `fill_known_fields` | Auto-fill all mapped fields from your profile. Returns a screenshot and a list of unique questions that still need answers. |
| `fill_answer` | Fill a specific answer into one field using the CSS selector returned by `fill_known_fields`. Call once per unique question. |
| `take_screenshot` | Screenshot the current state of the application page. |
| `scroll_page` | Scroll the page up or down to reveal additional fields. |
| `close_session` | Close the browser session. Call this after submitting or abandoning an application. |

---

## Example conversation

```
User:   Register me for AutoApply.

Claude: [calls register()] Your session ID is abc-123. Saved.

User:   Save my profile — Preet Rajdeo, preet@example.com, +1 415 555 0199,
        San Francisco CA, authorized to work in the US, no sponsorship needed.

Claude: [calls save_profile()] Profile saved.

User:   Apply to https://job-boards.greenhouse.io/acme/jobs/99999

Claude: [calls open_job_application()] Opened the page. I can see a form
        with name, email, phone, resume upload, and three essay questions.

        [calls fill_known_fields()] Filled: name, email, phone, work
        authorization, gender, ethnicity. Unique questions remaining:
          1. "Why do you want to work at Acme?"
          2. "Describe a time you solved a hard problem."

        [calls fill_answer() twice] Filled both essay responses.

        Here is a screenshot of the completed form. Please review and
        submit when ready.
```

---

## Self-hosting

### Docker

```bash
docker build -t autoapply-mcp .
docker run -p 3000:3000 -v /data:/data autoapply-mcp
```

The server listens on port 3000. Profile data is stored in `/data`.

### Deploy to Render

The repo includes a `render.yaml`. Click "New Web Service" in Render, connect the repo, and deploy. Set a persistent disk at `/data` so profiles survive restarts.

### Deploy to Railway

The repo includes a `Dockerfile` and `railway.json`. Connect the repo in Railway and it deploys automatically. Add a persistent volume at `/data`.

### Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

The server starts at `http://localhost:3000`. Point Claude Desktop at `http://localhost:3000/sse` during development.

### Environment variables

No required environment variables. All profile data is stored locally in `/data` as JSON files keyed by session ID.

---

## How it works

```
Claude Desktop
     |
     | MCP (SSE or Streamable HTTP)
     v
AutoApply MCP Server  (Express + @modelcontextprotocol/sdk)
     |
     | Playwright
     v
Real Chromium browser  →  Job application page
```

The server exposes two MCP transports on the same Express app:

- `/sse` + `/messages` — legacy SSE transport, used by `mcp-remote` and Claude Desktop
- `/mcp` — modern Streamable HTTP transport for direct connections

Each browser session is isolated by `session_id`. Sessions are created by `open_job_application` and destroyed by `close_session`. Screenshots are returned as base64-encoded PNG images embedded directly in MCP tool responses.

Field filling uses `Object.getOwnPropertyDescriptor` to set React-controlled input values and dispatches synthetic `input`, `change`, and `blur` events so the framework registers the change.

---

## Built with

- TypeScript
- Express
- Playwright
- @modelcontextprotocol/sdk

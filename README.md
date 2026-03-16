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

---

### First-time setup — Guided onboarding

Copy and paste the following prompt into a new Claude conversation. Claude will ask you the right questions and save everything automatically.

```
I want to set up my AutoApply profile. Please guide me through the setup
process by asking me these questions ONE AT A TIME. Wait for my answer
before moving on. At the end, call register() to get my session ID, then
call save_profile() with everything I've told you. Save my session ID in
this conversation so I can use it to apply to jobs.

Ask me:

PERSONAL INFO
1. What is your first and last name?
2. What is your email address?
3. What is your phone number? (include country code, e.g. +1 415 555 0100)
4. What city and state do you live in? (and country if not the US)
5. What is your street address and zip code? (optional — skip if you prefer)
6. What is your LinkedIn profile URL? (optional)
7. What is your GitHub profile URL? (optional)
8. Do you have a portfolio or personal website URL? (optional)

WORK AUTHORIZATION
9. Are you legally authorized to work in the United States?
10. Do you now or in the future require visa sponsorship?
11. Are you open to relocating for a role?

EDUCATION
12. What is your highest degree and the institution you earned it from?
    (e.g. "BS Computer Science from UC Berkeley")
    Do you have any other degrees to add? (repeat until done)

SALARY
13. What is your minimum acceptable annual salary? (e.g. "$120,000")
    Type "skip" if you prefer not to set this.

EEOC / DEMOGRAPHICS  (these are optional — all answers are kept private
and only used to fill EEOC compliance sections on applications)
14. How do you identify your gender?
    Options: Woman / Man / Non-binary / Prefer not to say / Decline to self-identify
15. How do you identify your ethnicity?
    Options: Hispanic or Latino / White / Black or African American /
    Native Hawaiian or Pacific Islander / Asian / Native American or
    Alaska Native / Two or more races / Decline to self-identify
16. What is your veteran status?
    Options: I am not a protected veteran / I am a protected veteran /
    Prefer not to say / Decline to self-identify
17. Do you have a disability?
    Options: No, I don't have a disability / Yes, I have a disability /
    Prefer not to say

CUSTOM QUESTION MAPPINGS
18. Are there any yes/no or short-answer questions that come up repeatedly
    on applications that you'd like AutoApply to always answer the same way?
    Examples:
      - "Are you located near [City]?" → Yes or No
      - "Are you a US citizen?" → Yes or No
      - "How did you hear about this job?" → LinkedIn
    Tell me each one and I'll save it as a custom mapping.
    Say "done" when finished.

Once I have all your answers, I'll register you and save your complete
profile in one go.
```

You only need to do this once. Your profile is stored server-side and reused for every application.

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

# AutoApply MCP

A Claude MCP server that fills job applications automatically using Playwright. Point it at any job URL and it fills the form, handles React-Select dropdowns, and surfaces unique questions for Claude to answer.

## How it works

```
You → Claude → AutoApply MCP → Playwright browser → Job site
```

1. Claude opens the job URL in a real browser
2. AutoApply fills all known fields (name, email, phone, dropdowns, work auth, etc.)
3. Unique open-ended questions are returned to Claude
4. Claude answers them using context about you and the job
5. You review a screenshot before submitting

## Connect to Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "autoapply": {
      "url": "https://YOUR-RAILWAY-URL/sse"
    }
  }
}
```

## Usage in Claude

```
"Fill out this job application for me: https://job-boards.greenhouse.io/..."
```

Claude will:
1. Call `register` to get a session ID (first time only)
2. Call `save_profile` with your info (first time only)
3. Call `open_job_application` to navigate to the URL
4. Call `fill_known_fields` to auto-fill everything it can
5. Answer each unique question and call `fill_answer` for each
6. Show you a screenshot of the completed form

## Available Tools

| Tool | Description |
|------|-------------|
| `register` | Get a session ID (do once) |
| `save_profile` | Save your info (do once, update anytime) |
| `get_profile` | Review your saved profile |
| `open_job_application` | Navigate to a job URL |
| `fill_known_fields` | Auto-fill all mapped fields + get unique questions |
| `fill_answer` | Fill one specific answer by selector |
| `take_screenshot` | See the current state |
| `scroll_page` | Scroll to see more fields |
| `close_session` | Close browser when done |

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Fork this repo on GitHub
2. Connect Railway to your GitHub repo
3. Railway auto-detects the Dockerfile and deploys
4. Add a persistent volume at `/data` for profile storage
5. Your MCP URL will be `https://your-app.railway.app/sse`

## Local development

```bash
npm install
npx playwright install chromium
npm run dev
```

Server runs at `http://localhost:3000/sse`

## What it handles

- ✅ Standard text inputs (name, email, phone, etc.)
- ✅ React-Select v4 dropdowns (Greenhouse, Lever, Ashby)
- ✅ Phone country code selectors
- ✅ Work authorization dropdowns
- ✅ Native `<select>` elements
- ✅ Textarea / open-ended questions (surfaced for Claude to answer)
- ✅ "How did you hear" → LinkedIn
- ✅ "Willing to relocate" → Yes

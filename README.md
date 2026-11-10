# ResearchFlow Backend

Backend for the Project-Managed Research Tool. Two things live here:

1. **A self-updating "AI tools for this research stage" catalog** — every
   stage (Problem Statement, Literature Review, Framework, Methodology,
   Ethics, Data Collection, Data Cleaning, Data Analysis, Results,
   Conclusion, Publication) has a list of real AI tools, served from
   `GET /api/ai-tools/:stage`. A scheduled job periodically searches the web
   for new tools per stage and merges them in — see "How discovery works"
   below.
2. **REST APIs for every interactive container** in the frontend (New
   Project, Journal Finder, Kanban tasks, Ethics Decision, Research
   Assistant), so state persists server-side instead of living only in the
   page's DOM.

## Quick start

```bash
cd researchflow-backend
npm install
cp .env.example .env     # then fill in whichever keys you have
npm start                # or npm run dev for auto-reload
```

The server listens on `PORT` (default `4000`). Data is stored as JSON files
under `DATA_DIR` (default `./data`) — no database setup required. Swap
`services/store.js` for a real DB later without touching any route.

Open `frontend/researchflow-app-connected.html` in a browser to use the
connected frontend. The home page lists your projects (also in the sidebar).
Opening a project shows its Kanban board, the research cycle with per-stage
progress, and the AI and digital tools available for each stage. The **Write**
tab is where you write the paper: pick a stage, type its section (saved
automatically), and every section is compiled in stage order into one
manuscript you can copy or download as Markdown.

## How discovery works (and how to make it "real")

Out of the box, with no API keys configured, `/api/ai-tools/:stage` serves a
curated seed list (`data/aiTools.seed.json`) and the scheduler simply logs
that discovery is idle. To make it actually go find new tools on a schedule:

1. Pick a web search provider and set `SEARCH_PROVIDER` + its key in `.env`:
   - `SERPAPI_KEY` (https://serpapi.com), or
   - `BING_API_KEY` (Bing Web Search API)
2. Set `ANTHROPIC_API_KEY` so raw search results get turned into clean,
   structured tool entries (name/url/description/category/apiAvailable/
   embeddable/tags) instead of being discarded.
3. Set `CRON_SCHEDULE` (default: every Monday 03:00) and leave
   `DISCOVERY_ENABLED=true`.

Each run: search the web per stage → ask Claude to extract structured tool
entries from the results → dedupe/merge into the stored registry (existing
entries get `lastVerified` bumped, new ones are appended with
`source: "discovered"`). Nothing is ever deleted automatically, so you can
audit newly discovered entries before trusting them fully.

You can also trigger a refresh manually:

```bash
curl -X POST "http://localhost:4000/api/ai-tools/refresh"            # all stages
curl -X POST "http://localhost:4000/api/ai-tools/refresh?stage=literature"
```

## API reference

### Authentication

Projects, tasks, ethics and the assistant require `Authorization: Bearer <token>`; each user only sees their own data. AI tools, journals and conferences are public.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/auth/signup` | `{name, email, password}` returns `{token, user}` |
| POST | `/api/auth/signin` | `{email, password}` |
| GET | `/api/auth/me` | current user |
| POST | `/api/auth/forgot-password` | `{email}`; always a generic reply |
| POST | `/api/auth/reset-password` | `{token, password}`; single use, 30 min |

Passwords need 8+ characters with a letter, a digit and a special character. Set `AUTH_SECRET` to fix the token-signing secret (otherwise one is generated into `data/authSecret.txt`). The first account to sign up claims any projects that have no owner.

No email service is configured: outside `NODE_ENV=production` the reset link is returned to the page and logged to the server console. In production, wire up email before relying on this flow.

### AI tools
| Method | Path | Description |
|---|---|---|
| GET | `/api/ai-tools` | All stages + catalog metadata (last refresh time) |
| GET | `/api/ai-tools/:stage` | Tools for one stage. `?embeddable=true` filters to tools usable inside this app |
| POST | `/api/ai-tools/refresh` | Kick off discovery for all stages (`?stage=X` for one) |

Valid `:stage` values: `problem`, `literature`, `framework`, `methodology`,
`ethics`, `datacollection`, `datacleaning`, `dataanalysis`, `results`,
`conclusion`, `publication`.

### Projects
| Method | Path | Description |
|---|---|---|
| GET | `/api/projects` | List all projects |
| GET | `/api/projects/:id` | Get one project |
| POST | `/api/projects` | Create `{ title, field, deadline, publicationType, ... }`. `publicationType` is required: `conference` needs a `conferenceId` from `/api/conferences`; `journal` accepts an optional `targetJournal`, and a non-empty `problemStatement` is then required; `thesis` uses the full thesis structure |
| PATCH | `/api/projects/:id/progress` | Update `{ stageKey, value }` (0-100) |
| POST | `/api/projects/:id/members` | Owner only. `{ email, role }` with role `coauthor` or `reviewer`; also accepted at creation as `coauthors` / `reviewers` |
| DELETE | `/api/projects/:id/members/:email` | Owner only. Remove a collaborator |
| POST | `/api/projects/:id/comments` | Any member. `{ section, text }` (`section` is a manuscript key, template key or `general`) |
| PATCH / DELETE | `/api/projects/:id/comments/:commentId` | Resolve (owner/co-author) / delete (author or owner) |
| PUT | `/api/projects/:id/manuscript/:section` | Save the text `{ text }` for one writing section (`abstract`, `keywords`, `introduction`, `problemStatement`, `objectives`, `literatureReview`, `frameworks`, `methodology`, `dataCollection`, `dataAnalysis`, `results`, `discussion`, `conclusion`, `references`, `conceptNote`, or a template section `t1`, `t2`, ...) |
| PUT | `/api/projects/:id/template` | Conference projects only. Set the sections from an uploaded template `{ sections: [headings], fileName }`. An empty array returns to the standard paper stages |
| DELETE | `/api/projects/:id` | Delete a project (owner only) |

Projects are shared by email: owners and co-authors can edit, reviewers can only read and comment. Projects returned include `myRole`, `members`, `comments`, `activity` and `lastEdit`.

### Tasks (Kanban)
| Method | Path | Description |
|---|---|---|
| GET | `/api/tasks?projectId=&column=` | List tasks, optionally filtered |
| POST | `/api/tasks` | Create `{ title, column, output, projectId }` |
| PATCH | `/api/tasks/:id` | Update any field, e.g. move `column` |
| DELETE | `/api/tasks/:id` | Delete a task |

### Ethics
| Method | Path | Description |
|---|---|---|
| GET | `/api/ethics/:projectId` | Current ethics record + display copy |
| PUT | `/api/ethics/:projectId` | Set `{ status, reason, applicationNumber, approvalDate, committee }` |

### Conferences
| Method | Path | Description |
|---|---|---|
| GET | `/api/conferences` | Selectable conferences with their template format, official template link and section outline. Edit `data/conferences.json` to add or change entries |

### Journals
| Method | Path | Description |
|---|---|---|
| GET | `/api/journals?field=&topic=` | Suggested journals for a field/topic (`field=all` returns every journal) |
| GET | `/api/journals/suggest?problem=&field=` | Live journal matching from the problem statement (OpenAlex). Needs at least a sentence. Optional `OPENALEX_API_KEY` env var raises the free rate limit |
| GET | `/api/literature/:projectId` | The project's stored knowledge base (papers and search history). Any member |
| POST | `/api/literature/:projectId/suggest` | Builds a search string from the problem statement, introduction, abstract and keywords |
| POST | `/api/literature/:projectId/search` | `{searchString, fromYear?}`. Searches OpenAlex and adds new papers to the knowledge base (max 400). Owner/co-author |
| DELETE | `/api/literature/:projectId/papers/:paperId` | Remove a paper from the knowledge base. Owner/co-author |
| POST | `/api/export/:format` | Auth required. `format` is `docx`, `pdf`, `pptx`, `xlsx` or `csv`. Body `{title, conference, targetJournal, sections:[{title,text}], tasks}`; returns the generated file. Excel/CSV include tables typed in sections (rows split by `\|` or tabs) |
| POST | `/api/templates/parse` | Auth required. Raw file body (max 15MB) plus URL-encoded `X-File-Name` header. Extracts section headings from a PDF, Word (.docx/.doc), ODT, RTF, LaTeX, Markdown or text template and returns `{fileName, headings}` |
| GET | `/api/news` | Newsroom feed: live funding opportunities (Grants.gov, cached 3h) plus curated conference, call-for-papers and funding links from `data/news.json` (edit that file to add items) |

### Research assistant
| Method | Path | Description |
|---|---|---|
| POST | `/api/assistant/generate` | `{ stage, topic, draftText }` → guidance bullets. Uses Claude if `ANTHROPIC_API_KEY` is set, otherwise a static template |

## Top ribbon

The ribbon (Home, About Us, What We Do, Resources, Newsroom, Contact Us) is defined in `frontend/researchflow-app-connected.html`. The page copy lives in `INFO_PAGES`, and the contact address is `CONTACT_EMAIL`. The contact form opens the visitor's email app, so no backend is involved.

## Notes

- All routes are plain JSON REST — no auth is included; add a standard
  session/JWT/API-key layer in front (e.g. `express` middleware) before
  exposing this beyond localhost.
- `services/store.js` is intentionally the only place that touches disk, so
  moving to Postgres/Mongo later is a one-file change.

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
| POST | `/api/projects` | Create `{ title, field, deadline }` |
| PATCH | `/api/projects/:id/progress` | Update `{ stageKey, value }` (0-100) |
| DELETE | `/api/projects/:id` | Delete a project |

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

### Journals
| Method | Path | Description |
|---|---|---|
| GET | `/api/journals?field=&topic=` | Suggested journals for a field/topic |

### Research assistant
| Method | Path | Description |
|---|---|---|
| POST | `/api/assistant/generate` | `{ stage, topic, draftText }` → guidance bullets. Uses Claude if `ANTHROPIC_API_KEY` is set, otherwise a static template |

## Notes

- All routes are plain JSON REST — no auth is included; add a standard
  session/JWT/API-key layer in front (e.g. `express` middleware) before
  exposing this beyond localhost.
- `services/store.js` is intentionally the only place that touches disk, so
  moving to Postgres/Mongo later is a one-file change.

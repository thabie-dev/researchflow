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

The home page shows deadline risk for each project: overdue after the due date,
high through 7 days, medium through 30 days, and low beyond 30 days. Projects
without a deadline are labelled separately. Risk uses the browser's local
calendar date and reflects time remaining only, not project progress.

In the Write and Concept Note views, references and the literature chatbot sit
beside the editor when there is room and stack below it on smaller screens.
In Write, use **Show AI tools, digital tools & research libraries** to expand
or hide the stage-specific tools and research-library actions.
Select text in either editor and use **UPPER** or **lower** in the Text case
group of the formatting ribbon to change its case. Linked citations remain intact.

Write and Concept Note provide a rich editor with heading styles, fonts and
sizes, bold, italic and underline, alignment, lists, and editable tables.
The ribbon groups controls by purpose; choose alignment (including justify)
from the Paragraph dropdown, and use Table actions to insert or edit a table.
The ribbon stays at the top while scrolling within a draft. Click a table cell
to show nearby controls for adding rows above or below and columns before or
after the selected cell. The ribbon's Table actions also remain available.
While editing a table, press **Alt+Shift+T** to focus the nearby controls;
use Tab to move between them.
Changes and saved versions retain formatting; legacy plain-text sections are
still supported. Tables support adding or removing rows and columns, but not
merged cells or custom column widths. Paste is restricted to supported content.
Tables can be pasted from sources such as Word, web pages and spreadsheets,
including tab-separated spreadsheet data. Supported inline text formatting is retained where possible;
unsupported styling, cell widths and cell alignment are not preserved. Tables
must be rectangular, with at most 100 rows and 12 columns, and must not contain
merged cells, nested tables or images. Unmerge cells before pasting.

**Formatted Word and PDF exports are not yet available.** To avoid silently
losing formatting, manuscript downloads are blocked once a manuscript section
contains rich formatting, including tables. Plain-text manuscripts remain
downloadable. The Concept Note is separate and has no download button yet.
Use **Remove formatting (save a version first)** to convert a section back to
plain text and unlock downloads; table cells become tab-separated text and a
formatted safety version is saved so the original can be restored.
Run `npm run build:editor` after changing the editor source.

### Linked references

Collect papers with **Find papers**, then use **References** in any writing
section or the Concept Note to select a paper and insert a linked citation at
the cursor. Choose APA 7, Harvard (Cite Them Right), IEEE or Vancouver for the
project; owners and co-authors can change the style, reviewers can preview it.
If a source is not found by search, owners and co-authors can open **Add a
reference manually** beside either editor. Add a journal article, book,
conference paper, report or web page to the project library; the new entry is
selected for citation and is also visible in the knowledge base. Enter one
author per line, given name followed by family name. Title and source type are
required; other details are optional but improve citation accuracy. Duplicate
DOIs and matching title/year entries are rejected. Optionally select a PDF and choose **Read PDF details** to prefill
empty title and author fields from embedded metadata and a single DOI found
on its first page. PDF metadata is often missing or inaccurate; review and
complete the form (including year and publication details) before saving.
Scanned PDFs need OCR for first-page text. The PDF is processed on the app
server and is not retained or sent to external services. Adding a reference
stores bibliographic metadata, not the document.
The editor displays linked citations in the selected style: for example,
APA uses `(Thabile, 2025)` or `(Thabile et al., 2025)` for three or more
authors; IEEE and Vancouver use numbers. Citations remain linked to the
library and are stored using citation identifiers, not as ordinary text.
The References section automatically displays a generated list of linked
manuscript citations; the Concept Note has its own list below its editor. The
same list is visible beside the editor. It updates when citations are added or
removed, the style changes, or source authors are corrected. The list is
derived from the saved citations and library rather than inserted as editable
text, and is rebuilt when the project is reopened. Preview and plain-text
manuscript downloads also include this bibliography.
Numbered styles follow the manuscript section order; the separate concept
note has its own numbering and preview. Existing manually typed references are
preserved alongside the generated list. Removing a cited library paper is
blocked until its current citation markers are removed. A document can contain
up to 1,000 linked citation markers.

Reference formatting uses CSL styles and is plain text in exports (not
editable Word citation fields); it is not a Microsoft Word add-in. Search
providers may return incomplete author names, journal details, volume, issue,
pages or publication type, so verify all citations and references against the
original sources and the target journal's current instructions. Some Harvard
and Vancouver variants differ by journal.

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
| PUT | `/api/projects/:id/reference-style` | Owner/co-author; `{style: "apa" \| "harvard" \| "ieee" \| "vancouver"}` saves the shared project citation style |
| POST | `/api/projects/:id/manuscript/:section/versions` | Save `{ text }` as a version and current content. Up to 25 versions are retained per section |
| POST | `/api/projects/:id/manuscript/:section/versions/:versionId/restore` | Restore a saved version; the replaced text is first saved as a safety version |
| POST | `/api/projects/:id/manuscript/:section/plain-text` | Convert a formatted section to plain text, first saving a formatted safety version |
| PUT | `/api/projects/:id/template` | Conference projects only. Set the sections from an uploaded template `{ sections: [headings], fileName }`. An empty array returns to the standard paper stages |
| DELETE | `/api/projects/:id` | Delete a project (owner only) |

Projects are shared by email: owners and co-authors can edit, reviewers can only read and comment. Projects returned include `myRole`, `members`, `comments`, `activity` and `lastEdit`.

The manuscript save and version endpoints also accept an experimental
`{ text, document }` payload. `document` is a validated structured document;
`text` must exactly match its plain-text projection. See
[`services/richDocument.js`](services/richDocument.js) for the supported
nodes, styles and limits. It is returned in `manuscriptRich` and stored with
versions. Once a section contains a document, changing its text without a
document returns HTTP 409 rather than discarding formatting. Restoring a
plain-text version intentionally replaces the formatted content and saves a
formatted safety version first. Formatted export is not yet implemented.

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
| POST | `/api/literature/:projectId/references/render` | Any member; `{sections:[{title,text}]}` formats linked citation markers using the project's style and returns formatted sections, a bibliography, and metadata warnings |
| POST | `/api/literature/:projectId/papers` | Owner/co-author; add a manual reference using `{type,title,authors,year,venue,publisher,volume,issue,pages,doi,url}`. `type`, `title` and an `authors` array (which may be empty) are required; returns the new `paper` and `knowledgeBase` |
| POST | `/api/literature/:projectId/references/pdf-prefill` | Owner/co-author; multipart `document` PDF (max 5 MB). Reads embedded title/authors and an unambiguous first-page DOI without saving the PDF or reference; returns editable `fields` and `textExtracted` |
| GET | `/api/literature/:projectId/analysis` | Local lexical term frequencies, co-occurrence pairs, publication-year counts and a suggested query from saved titles/abstracts. Any member; returns 409 until papers are collected |
| GET | `/api/literature/:projectId/analysis/expert-model` | Analyze saved titles/abstracts and uploaded analysis documents with a bounded 2–3 word phrase co-occurrence network, centrality and ranked-strength elbow pruning. Optional `?secondary=` chooses a saved secondary keyword and returns its editable Boolean query. Any member |
| POST | `/api/literature/:projectId/analysis/word2vec` | Train a bounded local skip-gram Word2Vec model; optional `{source:"all" \| "papers" \| "documents", terms:[...], mode:"similar" \| "dissimilar", axes:{x:[...],y:[...]}}`. Axes return cosine-similarity and source-level co-occurrence matrices. Any member |
| GET / POST | `/api/analysis/:projectId/documents` | List analysis document metadata (any member) or upload a PDF/UTF-8 text file as multipart `document` (owner/co-author) |
| DELETE | `/api/analysis/:projectId/documents/:documentId` | Remove an analysis document and its extracted text (owner/co-author) |
| PUT | `/api/literature/:projectId/strategy` | `{primaryKeyword, secondaryKeywords:[...]}` saves a reusable Boolean search strategy. Related phrases are ORed, then combined with the primary phrase using AND. Owner/co-author |
| POST | `/api/literature/:projectId/suggest` | Builds a search string from the problem statement, introduction, abstract and keywords |
| POST | `/api/literature/:projectId/search` | `{searchString, fromYear?, includeScopus?}`. Searches OpenAlex, Crossref, Semantic Scholar and arXiv; optionally searches Scopus. Adds results to the knowledge base (max 400), including available Open Access PDF links. Partial provider failures are reported in history and UI. Owner/co-author |
| PUT | `/api/literature/:projectId/papers/:paperId/authors` | Owner/co-author; `{authors:[...]}` saves a reviewed complete author list and clears the incomplete-author warning. Names must be in given-name family-name order. |
| DELETE | `/api/literature/:projectId/papers/:paperId` | Remove a paper from the knowledge base. Owner/co-author |
| POST | `/api/comparison?projectId=:id` | Authenticated project member; multipart `documents` with exactly two `.pdf`, `.docx`, `.md`, `.txt` or `.csv` files → cosine similarity, shared terms and document summaries |
| POST | `/api/comparison/bulk?projectId=:id` | Authenticated project member; multipart `documents` with 2–30 supported files (10 MB each, 30 MB total) → similarity matrix, strongest pairs, summaries and frequency-ranked lexical themes. This is lightweight lexical analysis, not the source app's BERTopic model |
| POST | `/api/export/:format` | Auth required. `format` is `docx`, `pdf`, `pptx`, `xlsx` or `csv`. Body `{title, conference, targetJournal, sections:[{title,text}], tasks}`; returns the generated file. Excel/CSV include tables typed in sections (rows split by `\|` or tabs) |
| POST | `/api/templates/parse` | Auth required. Raw file body (max 15MB) plus URL-encoded `X-File-Name` header. Extracts section headings from a PDF, Word (.docx/.doc), ODT, RTF, LaTeX, Markdown or text template and returns `{fileName, headings}` |
| GET | `/api/news` | Newsroom feed: live funding opportunities (Grants.gov, cached 3h) plus curated conference, call-for-papers and funding links from `data/news.json` (edit that file to add items) |

`OPENALEX_API_KEY`, `CROSSREF_MAILTO`, and `SEMANTIC_SCHOLAR_API_KEY` are optional; the literature search works without them, subject to each provider's public rate limits.

Scopus is **off by default**. To enable it, configure `ELSEVIER_API_KEY` on
the server and, if required by your institution, `ELSEVIER_INST_TOKEN`, then
restart the server. Keep both credentials out of client code and version
control. In Find papers, check **Include Scopus (Elsevier)** before searching.
The query is sent to Elsevier as a `TITLE-ABS-KEY` search; access depends on
your Elsevier key, institutional entitlement, and rate limits. This integration
retrieves up to 50 search metadata records per request, not the complete
Elsevier API or full-text downloads. Standard results may contain only the
first author, so review and correct the author list in the knowledge base
before citing. Citation formatting warns about unreviewed author lists.
Provider errors are shown in the search status and stored in search history.

The **Find papers** panel includes project-scoped analysis uploads. Only upload
files you have permission to use: their extracted text is stored in the local
data directory and is available to project members. Each project can hold 30
PDF or UTF-8 text documents, each at most 5 MB and 200,000 extracted
characters; image-only PDFs need OCR before uploading. Deleting a document or
project removes its extracted text. The original upload is not retained.

Expert Model analysis can be run on the whole corpus or sources containing a
saved secondary keyword, with an editable subdomain query. The elbow-based
pruning here is a local approximation, not the upstream Python spline. Both
models allow selecting collected papers, uploaded documents, or both. They run
locally; Word2Vec retrains on demand, scans at most the first
12,000 tokens (collected papers first), and does not persist embeddings.
Its similarities are exploratory, particularly on small corpora.
In Methodology, choose a corpus and **Train Word2Vec** to inspect vocabulary.
Enter up to 12 comma-separated single words for each axis and select
**Train & generate heat maps**. The first map shows cosine similarity; the
second counts sources containing both words, including diagonal source
frequencies. Both use the same truncated corpus. Tokenization currently
supports English words of at least three characters and removes stop words;
rare words may be excluded from the vocabulary. Changing keywords retrains
the model rather than reusing a saved model.
The Expert Model and Word2Vec endpoints run locally over the project's saved metadata; Word2Vec caps training to 12,000 tokens and does not send corpus text to an external embedding service.
In the Write workspace, pipeline actions are surfaced beside the relevant stages: search/acquisition for the Literature Review, network analysis for the framework, corpus reuse through Methodology and Data Collection, and Word2Vec, publication trends, comparison, and corpus chat in Data Analysis and Results.
The same project literature chatbot is available beside every manuscript section, in the Concept Note, and in Ethics & Assistant. Conversations are shared across stages within the current browser session. The stage name is sent with the question; manuscript or concept-note text is not sent automatically.

### Research assistant
| Method | Path | Description |
|---|---|---|
| POST | `/api/assistant/generate` | `{ stage, topic, draftText }` → guidance bullets. Uses Claude if `ANTHROPIC_API_KEY` is set, otherwise a static template |
| POST | `/api/assistant/chat` | Authenticated project member; `{ projectId, question, history?, stage? }` → an answer and cited matching papers from the project's stored titles/abstracts. Requires `ANTHROPIC_API_KEY`; chat history is supplied by the client and is not persisted |

## Top ribbon

The ribbon (Home, About Us, What We Do, Resources, Newsroom, Contact Us) is defined in `frontend/researchflow-app-connected.html`. The page copy lives in `INFO_PAGES`, and the contact address is `CONTACT_EMAIL`. The contact form opens the visitor's email app, so no backend is involved.

## Notes

- All routes are plain JSON REST — no auth is included; add a standard
  session/JWT/API-key layer in front (e.g. `express` middleware) before
  exposing this beyond localhost.
- `services/store.js` is intentionally the only place that touches disk, so
  moving to Postgres/Mongo later is a one-file change.

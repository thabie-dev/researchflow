/**
 * Keeps the "AI tools for this research stage" catalog fresh.
 *
 * Flow per stage:
 *   1. searchWeb(stage)      -> raw search results from a pluggable provider
 *   2. extractTools(results) -> structured {name,url,description,...} entries
 *   3. registry.mergeDiscovered(stage, entries)
 *
 * Both steps degrade gracefully with no external keys configured:
 *   - No SEARCH_PROVIDER -> step 1 returns [] (registry just keeps the seed list)
 *   - No ANTHROPIC_API_KEY -> step 2 falls back to a cheap heuristic parser
 *
 * Swap searchWeb's provider branch or extractTools' parser to plug in a
 * different search API or LLM without touching the routes/scheduler.
 */
const axios = require('axios');
const config = require('../config');
const registry = require('./aiToolsRegistry');

const STAGE_QUERY_KEYWORDS = {
  problem: 'AI tools for defining a research problem statement and research gap 2026',
  literature: 'AI tools for academic literature review and citation mapping 2026',
  framework: 'AI tools for conceptual and theoretical framework research 2026',
  methodology: 'AI tools for research methodology and study design 2026',
  ethics: 'AI tools for research ethics applications and consent forms 2026',
  datacollection: 'AI tools for research data collection surveys interviews 2026',
  datacleaning: 'AI tools for data cleaning and preprocessing for research 2026',
  dataanalysis: 'AI tools for qualitative and quantitative data analysis research 2026',
  results: 'AI tools for research results visualization and figures 2026',
  conclusion: 'AI tools for academic writing conclusions and recommendations 2026',
  publication: 'AI tools for academic manuscript editing and journal submission 2026',
};

async function searchWeb(stage) {
  const query = STAGE_QUERY_KEYWORDS[stage];
  if (!query) return [];

  try {
    if (config.searchProvider === 'serpapi' && config.serpApiKey) {
      const { data } = await axios.get('https://serpapi.com/search.json', {
        params: { q: query, api_key: config.serpApiKey, num: 10 },
        timeout: 15000,
      });
      return (data.organic_results || []).map((r) => ({
        title: r.title,
        snippet: r.snippet,
        url: r.link,
      }));
    }

    if (config.searchProvider === 'bing' && config.bingApiKey) {
      const { data } = await axios.get('https://api.bing.microsoft.com/v7.0/search', {
        params: { q: query, count: 10 },
        headers: { 'Ocp-Apim-Subscription-Key': config.bingApiKey },
        timeout: 15000,
      });
      return (data.webPages?.value || []).map((r) => ({
        title: r.name,
        snippet: r.snippet,
        url: r.url,
      }));
    }
  } catch (err) {
    console.error(`[discovery] search failed for stage "${stage}":`, err.message);
  }

  return []; // SEARCH_PROVIDER=none, missing key, or provider error
}

/** LLM-based structuring: turn raw search hits into consistent tool entries. */
async function extractToolsWithClaude(stage, results) {
  const prompt = `You are curating a catalog of AI-powered software tools useful at the
"${stage}" stage of an academic research project.

Given these raw web search results, extract only genuine, named AI tools/products
(not generic articles, not university pages, not "top 10 list" blog posts unless a
specific tool is clearly named in the snippet). For each tool return:
- name (string)
- url (string, the tool's own homepage if inferable, else the source link)
- description (one sentence, plain language, on how it helps at this research stage)
- category (short kebab-case tag, e.g. "literature-discovery")
- apiAvailable (boolean, true only if you have reasonable evidence of a public API)
- embeddable (boolean, true only if apiAvailable is true or it's clearly a web app
  usable via a simple link/iframe)
- tags (array of 1-3 short strings)

Respond ONLY with a JSON array of such objects. If nothing qualifies, respond with [].

Search results:
${JSON.stringify(results.slice(0, 10), null, 2)}`;

  try {
    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: config.anthropicModel,
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      },
      {
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.anthropicApiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 30000,
      }
    );

    const text = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```$/, '');

    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error(`[discovery] Claude extraction failed for stage "${stage}":`, err.message);
    return [];
  }
}

/** No-LLM fallback: very conservative, just returns nothing rather than guessing. */
function extractToolsHeuristically() {
  return [];
}

async function extractTools(stage, results) {
  if (!results.length) return [];
  if (config.anthropicApiKey) return extractToolsWithClaude(stage, results);
  return extractToolsHeuristically(results);
}

async function runDiscoveryForStage(stage) {
  const results = await searchWeb(stage);
  const entries = await extractTools(stage, results);
  if (entries.length) {
    await registry.mergeDiscovered(stage, entries);
  }
  return { stage, found: entries.length };
}

async function runDiscoveryForAllStages() {
  const summary = [];
  for (const stage of registry.listStages()) {
    // Sequential, not parallel: gentle on rate limits for both the search
    // provider and the extraction LLM.
    // eslint-disable-next-line no-await-in-loop
    summary.push(await runDiscoveryForStage(stage));
  }
  registry.touchMeta({ lastRefreshed: new Date().toISOString() });
  return summary;
}

module.exports = { runDiscoveryForStage, runDiscoveryForAllStages };

const express = require('express');
const axios = require('axios');
const router = express.Router();
const config = require('../config');

// Same structured guidance the original frontend hard-coded, now served from
// the backend so it can be edited centrally and reused by other clients.
const TEMPLATES = {
  problem: {
    title: 'Problem Statement & Concept Note Support',
    bullets: [
      'Clarify the broad research area and background.',
      'Identify what is already known in the literature.',
      'Identify what remains unclear, underexplored, inconsistent, or context-specific.',
      'Convert the literature gap into a focused problem statement.',
      'Develop the aim, objectives, research questions, and expected contribution.',
    ],
  },
  literature: {
    title: 'Literature Review Support',
    bullets: [
      'Use the problem statement to guide the literature review structure.',
      'Define key concepts and terminology.',
      'Group literature into themes.',
      'Compare findings, methods, theories, and contexts.',
      'End by showing the gap your study addresses.',
    ],
  },
  framework: {
    title: 'Framework Support',
    bullets: [
      'Identify key concepts, variables, or constructs.',
      'Map relationships between concepts.',
      'Select theories that explain the study problem.',
      'Develop a conceptual model.',
    ],
  },
  methodology: {
    title: 'Methodology Support',
    bullets: [
      'Select qualitative, quantitative, or mixed-methods approach.',
      'Define research design, population, sample, and sampling strategy.',
      'Select data collection instruments.',
      'Explain validity, reliability, trustworthiness, and ethics.',
    ],
  },
  datacollection: {
    title: 'Data Collection Support',
    bullets: [
      'Qualitative: interviews, focus groups, observations, document analysis.',
      'Quantitative: surveys, experiments, structured datasets, measurements.',
      'Mixed methods: combine qualitative explanation with quantitative measurement.',
    ],
  },
  dataanalysis: {
    title: 'Data Analysis Support',
    bullets: [
      'Qualitative: coding, thematic analysis, content analysis.',
      'Quantitative: descriptive statistics, regression, ANOVA, PCA, modelling.',
      'Link each output to a research objective.',
    ],
  },
  results: {
    title: 'Results & Discussion Support',
    bullets: [
      'Present findings according to objectives.',
      'Use tables, graphs, themes, or models.',
      'Compare findings with literature.',
    ],
  },
  conclusion: {
    title: 'Conclusion & Recommendations Support',
    bullets: [
      'Restate the research problem and aim.',
      'Summarise findings.',
      'Provide recommendations, limitations, and future research.',
    ],
  },
  publication: {
    title: 'Submission & Publication Support',
    bullets: [
      'Prepare title, abstract, keywords, and manuscript structure.',
      'Check journal scope and author guidelines.',
      'Track submission, reviewer comments, revisions, and acceptance.',
    ],
  },
};

async function generateWithClaude({ stage, topic, draftText }) {
  const template = TEMPLATES[stage];
  const prompt = `A researcher is at the "${template.title}" stage.
Their topic: "${topic}"
${draftText ? `Their current draft/notes:\n"""${draftText}"""` : '(No draft text provided yet.)'}

Using this checklist as the required structure, write 4-6 short, specific,
actionable bullet points tailored to their actual topic/draft (not generic
restatements of the checklist):
${template.bullets.map((b) => `- ${b}`).join('\n')}

Respond ONLY with a JSON array of strings (the bullets). No preamble.`;

  const { data } = await axios.post(
    'https://api.anthropic.com/v1/messages',
    { model: config.anthropicModel, max_tokens: 800, messages: [{ role: 'user', content: prompt }] },
    {
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      timeout: 20000,
    }
  );

  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '');

  const bullets = JSON.parse(text);
  if (!Array.isArray(bullets) || !bullets.length) throw new Error('Empty/invalid generation');
  return bullets;
}

router.post('/generate', async (req, res) => {
  const { stage, topic, draftText } = req.body || {};
  const template = TEMPLATES[stage];
  if (!template) {
    return res.status(400).json({ error: `Unknown stage "${stage}". Valid: ${Object.keys(TEMPLATES).join(', ')}` });
  }

  const safeTopic = topic && topic.trim() ? topic.trim() : 'your study';
  let bullets = template.bullets;
  let generatedBy = 'template';

  if (config.anthropicApiKey) {
    try {
      bullets = await generateWithClaude({ stage, topic: safeTopic, draftText });
      generatedBy = 'claude';
    } catch (err) {
      console.error('[assistant] Claude generation failed, falling back to template:', err.message);
    }
  }

  res.json({ stage, title: template.title, topic: safeTopic, bullets, generatedBy });
});

module.exports = router;

const express = require('express');
const router = express.Router();

// Static curated shortlist, moved server-side so it can be edited/extended
// (or later swapped for a live journal-matching API) without shipping a new
// frontend build.
const JOURNALS = {
  education: [
    { name: 'International Journal of Educational Technology in Higher Education', fit: 'Digital learning, LMS, AI in education, and higher education technology.' },
    { name: 'Teaching and Teacher Education', fit: 'Pedagogy, teacher development, and educational practice.' },
    { name: 'Higher Education', fit: 'Higher education policy, institutions, teaching, and academic development.' },
  ],
  technology: [
    { name: 'Information Systems Frontiers', fit: 'Digital systems, AI adoption, analytics, and information systems research.' },
    { name: 'Computers in Human Behavior', fit: 'User behaviour, technology use, AI tools, and digital interaction studies.' },
    { name: 'Technology in Society', fit: 'Technology, innovation, society, and digital transformation.' },
  ],
  sustainability: [
    { name: 'Journal of Cleaner Production', fit: 'Sustainability, circularity, ESG, cleaner production, environmental management.' },
    { name: 'Business Strategy and the Environment', fit: 'ESG, sustainability reporting, corporate responsibility, environmental strategy.' },
    { name: 'Sustainability Accounting, Management and Policy Journal', fit: 'ESG disclosure, sustainability accounting, and policy-related studies.' },
  ],
  science: [
    { name: 'Analytical Methods', fit: 'Analytical chemistry, method development, validation, laboratory-based studies.' },
    { name: 'Food Chemistry', fit: 'Food analysis, authentication, chemical profiling, and quality studies.' },
    { name: 'Talanta', fit: 'Analytical techniques, sensors, chemometrics, and measurement science.' },
  ],
  business: [
    { name: 'Journal of Business Research', fit: 'Business, management, innovation, markets, and organisational research.' },
    { name: 'Management Decision', fit: 'Management practice, strategy, decision-making, organisational studies.' },
    { name: 'Technological Forecasting and Social Change', fit: 'Innovation, forecasting, technology adoption, socio-economic change.' },
  ],
  general: [
    { name: 'PLOS ONE', fit: 'Broad-scope journal for technically sound research across disciplines.' },
    { name: 'Scientific Reports', fit: 'Broad-scope journal for original research across natural and social sciences.' },
    { name: 'Heliyon', fit: 'Broad multidisciplinary journal for research across multiple fields.' },
  ],
};

const { suggestJournals } = require('../services/journalSearch');

// Live matching: finds journals publishing papers similar to the problem statement.
router.get('/suggest', async (req, res) => {
  const problem = String(req.query.problem || '').trim();
  if (problem.length < 20) {
    return res.status(400).json({ error: 'Please describe your problem statement (at least a sentence) so journals can be matched.' });
  }
  try {
    const result = await suggestJournals({ problem, field: String(req.query.field || '') });
    res.json(result);
  } catch (err) {
    res.status(502).json({ error: 'Could not reach the journal database right now. Please try again shortly.' });
  }
});

router.get('/', (req, res) => {
  const field = (req.query.field || 'general').toLowerCase();
  const topic = req.query.topic || 'your research topic';

  if (field !== 'all' && !JOURNALS[field]) {
    return res.status(400).json({ error: `Unknown field "${field}". Valid: all, ${Object.keys(JOURNALS).join(', ')}` });
  }

  const journals = field === 'all' ? Object.values(JOURNALS).flat() : JOURNALS[field];
  res.json({
    field,
    topic,
    journals: journals.map((j) => ({ ...j, topicFit: topic })),
  });
});

module.exports = router;

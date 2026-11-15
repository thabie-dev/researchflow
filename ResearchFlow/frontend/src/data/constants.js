export const STAGES_DEF = [
  {
    id: "concept_note",
    name: "Concept Note",
    desc: "Define core problem, objectives, expected impact.",
  },
  {
    id: "proposal",
    name: "Research Proposal",
    desc: "Background, research questions, methodology, timeline.",
  },
  {
    id: "introduction",
    name: "Introduction",
    desc: "Context, problem statement, significance and scope.",
  },
  {
    id: "literature_review",
    name: "Literature Review",
    desc: "Thematic synthesis, gaps, theoretical framework.",
  },
  {
    id: "methodology",
    name: "Methodology",
    desc: "Design, data collection, analysis plan.",
  },
  {
    id: "results",
    name: "Results / Findings",
    desc: "Data presentation, key results, visual insights.",
  },
  {
    id: "discussion",
    name: "Discussion",
    desc: "Interpretation, implications, limitations.",
  },
  {
    id: "conclusion",
    name: "Conclusion",
    desc: "Summary, recommendations, future directions.",
  },
  {
    id: "references",
    name: "References",
    desc: "Bibliography and citation management.",
  },
];

export const TOOLS_BY_STAGE = {
  concept_note: [
    {
      title: "Guiding Questions",
      text: "What problem is addressed? Why does it matter? Who is the audience? What is the intended outcome?",
    },
    {
      title: "Structure Template",
      text: "1. Problem statement\n2. Research aim(s)\n3. Preliminary methods\n4. Expected outcomes and significance",
    },
  ],
  proposal: [
    {
      title: "Core Components",
      text: "Abstract, intro, lit review, research design, ethical considerations, budget, timeline.",
    },
    {
      title: "SMART Objectives",
      text: "Specific, Measurable, Achievable, Relevant, Time-bound.",
    },
  ],
  introduction: [
    {
      title: "Funnel Structure",
      text: "Broad context -> specific problem -> research gap -> objectives -> outline.",
    },
  ],
  literature_review: [
    {
      title: "Synthesis Matrix",
      text: "Author | Theme | Findings | Gaps. Identify 3-5 major debates.",
    },
  ],
  methodology: [
    {
      title: "Research Onion",
      text: "Philosophy -> Approach -> Strategy -> Choice -> Time horizon -> Techniques.",
    },
  ],
  results: [
    {
      title: "Data Display",
      text: "Tables, thematic summaries, statistical highlights. Avoid interpretation here.",
    },
  ],
  discussion: [
    {
      title: "Relate to Literature",
      text: "How do findings confirm or contradict earlier studies? Theoretical implications.",
    },
  ],
  conclusion: [
    {
      title: "Take-home Message",
      text: "Summarize contributions, practical recommendations, closing statement.",
    },
  ],
  references: [
    {
      title: "Citation Manager",
      text: "Use APA/MLA consistently. Tools: Zotero, Mendeley.",
    },
  ],
};
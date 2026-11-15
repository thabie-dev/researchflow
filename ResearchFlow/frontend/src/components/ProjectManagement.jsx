import React, { useState, useEffect } from 'react';

const LIFECYCLE_METADATA = [
  { number: 1, title: "Problem Statement", desc: "Develop topic, background, literature gap, research problem, aim, objectives, and research questions.", tags: ["Research Gap", "Problem", "Objectives"] },
  { number: 2, title: "Concept Note", desc: "Summarise the study rationale, contribution, scope, methods, expected outputs, and feasibility.", tags: ["Rationale", "Scope", "Contribution"] },
  { number: 3, title: "Literature Review", desc: "Use the problem statement to build headings, subheadings, themes, debates, and gaps.", tags: ["Themes", "Headings", "Gap"] },
  { number: 4, title: "Conceptual & Theoretical Framework", desc: "Identify relevant theories, concepts, variables, constructs, and relationships for the study.", tags: ["Theory", "Variables", "Model"] },
  { number: 5, title: "Methodology", desc: "Curate research approach, design, population, sampling, instruments, validity, and analysis plan.", tags: ["Qualitative", "Quantitative", "Mixed Methods"] },
  { number: 6, title: "Ethics Decision", desc: "Determine whether ethics is required, not required, or already approved before data collection.", tags: ["Not Required", "Required", "Approved"] },
  { number: 7, title: "Data Collection", desc: "Manage qualitative, quantitative, mixed-methods, laboratory, fieldwork, or secondary data collection.", tags: ["Survey", "Interview", "Dataset"] },
  { number: 8, title: "Data Cleaning", desc: "Prepare, code, validate, transform, anonymise, and organise data for analysis.", tags: ["Cleaning", "Coding", "Validation"] },
  { number: 9, title: "Data Analysis", desc: "Run qualitative coding, statistical tests, models, visualisations, or experimental analysis.", tags: ["Statistics", "Themes", "Graphs"] },
  { number: 10, title: "Writing", desc: "Write introduction, literature review, methods, results, discussion, conclusion, and recommendations.", tags: ["Chapters", "Manuscript", "Drafting"] },
  { number: 11, title: "Review & Submission", desc: "Manage feedback, revision, formatting, referencing, journal submission, and final archiving.", tags: ["Review", "Submission", "Publication"] }
];

const PM_PHASES = ["Initiation", "Planning", "Execution", "Monitoring & Control", "Closing"];

const ASSISTANT_GUIDANCE = {
  problem: {
    title: "Problem Statement & Concept Note Support",
    items: [
      "Clarify the broad research area and background.",
      "Identify what is already known in the literature.",
      "Identify what remains unclear, underexplored, inconsistent, or context-specific.",
      "Convert the literature gap into a focused problem statement.",
      "Develop the aim, objectives, research questions, and expected contribution."
    ]
  },
  literature: {
    title: "Literature Review Support",
    items: [
      "Use the problem statement to guide the literature review structure.",
      "Define key concepts and terminology.",
      "Group literature into themes.",
      "Compare findings, methods, theories, and contexts.",
      "End by showing the gap your study addresses."
    ]
  },
  framework: {
    title: "Framework Support",
    items: [
      "Identify key concepts, variables, or constructs.",
      "Map relationships between concepts.",
      "Select theories that explain the study problem.",
      "Develop a conceptual model."
    ]
  },
  methodology: {
    title: "Methodology Support",
    items: [
      "Select qualitative, quantitative, or mixed-methods approach.",
      "Define research design, population, sample, and sampling strategy.",
      "Select data collection instruments.",
      "Explain validity, reliability, trustworthiness, and ethics."
    ]
  },
  datacollection: {
    title: "Data Collection Support",
    items: [
      "Qualitative: interviews, focus groups, observations, document analysis.",
      "Quantitative: surveys, experiments, structured datasets, measurements.",
      "Mixed methods: combine qualitative explanation with quantitative measurement."
    ]
  },
  dataanalysis: {
    title: "Data Analysis Support",
    items: [
      "Qualitative: coding, thematic analysis, content analysis.",
      "Quantitative: descriptive statistics, regression, ANOVA, PCA, modelling.",
      "Link each output to a research objective."
    ]
  },
  results: {
    title: "Results & Discussion Support",
    items: [
      "Present findings according to objectives.",
      "Use tables, graphs, themes, or models.",
      "Compare findings with literature."
    ]
  },
  conclusion: {
    title: "Conclusion & Recommendations Support",
    items: [
      "Restate the research problem and aim.",
      "Summarise findings.",
      "Provide recommendations, limitations, and future research."
    ]
  },
  publication: {
    title: "Submission & Publication Support",
    items: [
      "Prepare title, abstract, keywords, and manuscript structure.",
      "Check journal scope and author guidelines.",
      "Track submission, reviewer comments, revisions, and acceptance."
    ]
  }
};

const JOURNAL_DATABASE = {
  education: [
    ["International Journal of Educational Technology in Higher Education", "Suitable for digital learning, LMS, AI in education, and higher education technology."],
    ["Teaching and Teacher Education", "Suitable for pedagogy, teacher development, and educational practice."],
    ["Higher Education", "Suitable for higher education policy, institutions, teaching, and academic development."]
  ],
  technology: [
    ["Information Systems Frontiers", "Suitable for digital systems, AI adoption, analytics, and information systems research."],
    ["Computers in Human Behavior", "Suitable for user behaviour, technology use, AI tools, and digital interaction studies."],
    ["Technology in Society", "Suitable for technology, innovation, society, and digital transformation."]
  ],
  sustainability: [
    ["Journal of Cleaner Production", "Suitable for sustainability, circularity, ESG, cleaner production, and environmental management."],
    ["Business Strategy and the Environment", "Suitable for ESG, sustainability reporting, corporate responsibility, and environmental strategy."],
    ["Sustainability Accounting, Management and Policy Journal", "Suitable for ESG disclosure, sustainability accounting, and policy-related studies."]
  ],
  science: [
    ["Analytical Methods", "Suitable for analytical chemistry, method development, validation, and laboratory-based studies."],
    ["Food Chemistry", "Suitable for food analysis, authentication, chemical profiling, and quality studies."],
    ["Talanta", "Suitable for analytical techniques, sensors, chemometrics, and measurement science."]
  ],
  business: [
    ["Journal of Business Research", "Suitable for business, management, innovation, markets, and organisational research."],
    ["Management Decision", "Suitable for management practice, strategy, decision-making, and organisational studies."],
    ["Technological Forecasting and Social Change", "Suitable for innovation, forecasting, technology adoption, and socio-economic change."]
  ],
  general: [
    ["PLOS ONE", "Broad-scope journal for technically sound research across disciplines."],
    ["Scientific Reports", "Broad-scope journal for original research across natural and social sciences."],
    ["Heliyon", "Broad multidisciplinary journal for research across multiple fields."]
  ]
};

export default function ProjectManagement({ projectId }) {
  const [activeTab, setActiveTab] = useState('kanban');
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Backend synced states
  const [tasks, setTasks] = useState([]);
  const [stages, setStages] = useState([]);
  const [ethics, setEthics] = useState({
    status: '',
    reason: '',
    approval_number: '',
    approval_date: '',
    committee_name: '',
    certificate_filename: ''
  });
  const [notes, setNotes] = useState({});

  // Task Form State
  const [taskTitle, setTaskTitle] = useState('');
  const [taskStage, setTaskStage] = useState('Problem Statement');
  const [taskPmPhase, setTaskPmPhase] = useState('Planning');
  const [taskStatus, setTaskStatus] = useState('todo');
  const [taskOutput, setTaskOutput] = useState('');
  const [stageFilter, setStageFilter] = useState('ALL');

  // Research Assistant State
  const [selectedAssistantStage, setSelectedAssistantStage] = useState('problem');
  const [assistantTopic, setAssistantTopic] = useState('');
  const [assistantDraft, setAssistantDraft] = useState('');
  const [noteSavedMsg, setNoteSavedMsg] = useState('');

  // Journal Finder State
  const [journalTopic, setJournalTopic] = useState('');
  const [journalField, setJournalField] = useState('general');
  const [suggestedJournals, setSuggestedJournals] = useState([]);

  // Fetch all PM data on load
  useEffect(() => {
    if (!projectId) return;
    const loadPmData = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/pm`);
        if (res.ok) {
          const data = await res.json();
          setTasks(data.tasks || []);
          setStages(data.stages || []);
          if (data.ethics) setEthics(data.ethics);
          if (data.notes) {
            setNotes(data.notes);
            const initialNote = data.notes['problem'];
            if (initialNote) {
              setAssistantTopic(initialNote.topic || '');
              setAssistantDraft(initialNote.draft_text || '');
            }
          }
        }
      } catch (err) {
        console.error("Failed to fetch Project Management data:", err);
      }
    };
    loadPmData();
  }, [projectId]);

  // Sync Assistant inputs when switching stage dropdown
  const handleSelectAssistantStage = (newKey) => {
    setSelectedAssistantStage(newKey);
    const saved = notes[newKey];
    setAssistantTopic(saved?.topic || '');
    setAssistantDraft(saved?.draft_text || '');
  };

  // --- HANDLERS: TASKS & KANBAN ---
  const handleAddTask = async () => {
    if (!taskTitle.trim()) return alert("Please enter a task title.");
    const payload = {
      title: taskTitle.trim(),
      research_stage: taskStage,
      pm_phase: taskPmPhase,
      status: taskStatus,
      expected_output: taskOutput.trim()
    };

    try {
      const res = await fetch(`/api/projects/${projectId}/pm/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const created = await res.json();
        setTasks(prev => [created, ...prev]);
        setTaskTitle('');
        setTaskOutput('');
        setTaskStatus('todo');
      }
    } catch (err) {
      console.error("Error adding task:", err);
    }
  };

  const handleMoveTask = async (taskId, newStatus) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await fetch(`/api/projects/${projectId}/pm/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (err) {
      console.error("Error moving task:", err);
    }
  };

  const handleDeleteTask = async (taskId) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
    try {
      await fetch(`/api/projects/${projectId}/pm/tasks/${taskId}`, { method: 'DELETE' });
    } catch (err) {
      console.error("Error deleting task:", err);
    }
  };

  // --- HANDLERS: 11-STAGE LIFECYCLE PROGRESS ---
  const handleStageUpdate = async (stageNumber, newProgress, newPmPhase) => {
    setStages(prev => prev.map(s => 
      s.stage_number === stageNumber ? { ...s, progress: Number(newProgress), pm_phase: newPmPhase } : s
    ));
    try {
      await fetch(`/api/projects/${projectId}/pm/stages`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage_number: stageNumber,
          progress: Number(newProgress),
          pm_phase: newPmPhase
        })
      });
    } catch (err) {
      console.error("Error updating stage:", err);
    }
  };

  // --- HANDLERS: ETHICS ---
  const handleSaveEthics = async (updatedEthics) => {
    setEthics(updatedEthics);
    try {
      await fetch(`/api/projects/${projectId}/pm/ethics`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedEthics)
      });
    } catch (err) {
      console.error("Error saving ethics:", err);
    }
  };

  const handleEthicsFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`/api/projects/${projectId}/pm/ethics/upload`, {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        setEthics(prev => ({ ...prev, certificate_filename: data.filename }));
      }
    } catch (err) {
      console.error("Failed to upload certificate:", err);
    }
  };

  // --- HANDLERS: RESEARCH ASSISTANT NOTES ---
  const handleSaveNote = async () => {
    const payload = {
      stage_key: selectedAssistantStage,
      topic: assistantTopic,
      draft_text: assistantDraft
    };
    setNotes(prev => ({ ...prev, [selectedAssistantStage]: payload }));
    try {
      await fetch(`/api/projects/${projectId}/pm/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      setNoteSavedMsg('Saved!');
      setTimeout(() => setNoteSavedMsg(''), 2000);
    } catch (err) {
      console.error("Failed to save note:", err);
    }
  };

  // --- HANDLERS: JOURNAL FINDER ---
  const handleFindJournals = () => {
    const matches = JOURNAL_DATABASE[journalField] || JOURNAL_DATABASE.general;
    setSuggestedJournals(matches);
  };

  // --- COMPUTED METRICS ---
  const pendingTasksCount = tasks.filter(t => t.status !== 'done').length;
  const completedStagesCount = stages.filter(s => s.progress === 100).length;
  const overallProgress = stages.length > 0
    ? Math.round(stages.reduce((acc, s) => acc + (Number(s.progress) || 0), 0) / stages.length)
    : 0;

  const filteredTasks = stageFilter === 'ALL'
    ? tasks
    : tasks.filter(t => t.research_stage === stageFilter);

  const renderBadge = (status) => {
    if (status === 'todo') return <span style={{ background: '#FFF3D6', color: '#C08A00', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>To Do</span>;
    if (status === 'progress') return <span style={{ background: '#DDEEFF', color: '#1E88E5', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>In Progress</span>;
    if (status === 'review') return <span style={{ background: '#E8F2FF', color: '#0F4C81', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Review</span>;
    if (status === 'done') return <span style={{ background: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Done</span>;
    return null;
  };

  return (
    <div style={{
      background: '#ffffff',
      borderRadius: '16px',
      boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
      border: '1px solid #E5E7EB',
      borderLeft: '7px solid #F26A2E',
      overflow: 'hidden',
      marginBottom: '30px'
    }}>
      {/* HEADER BAR */}
      <div style={{
        padding: '22px 28px',
        color: '#ffffff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '15px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 750,color: 'var(--primary)' }}>
              Project Management Suite
            </h3>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'rgba(255,255,255,0.15)',
            color: 'var(--primary)',
            border: '1px solid rgba(255,255,255,0.3)',
            padding: '8px 16px',
            borderRadius: '10px',
            fontWeight: 700,
            cursor: 'pointer',
            fontSize: '0.85rem'
          }}
        >
          {isCollapsed ? 'Expand Workspace' : 'Minimise Workspace'}
        </button>
      </div>

      {!isCollapsed && (
        <div style={{ padding: '25px' }}>
          {/* TOP SUMMARY STATS */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '16px',
            marginBottom: '25px'
          }}>
            <div style={{ background: '#FAF8F3', padding: '18px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h4 style={{ color: '#6B7280', fontSize: '12px', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Research Lifecycle Stages</h4>
              <strong style={{ fontSize: '26px', color: '#0F4C81' }}>{completedStagesCount} / {stages.length || 11} Done</strong>
            </div>
            <div style={{ background: '#FAF8F3', padding: '18px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h4 style={{ color: '#6B7280', fontSize: '12px', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Pending Research Tasks</h4>
              <strong style={{ fontSize: '26px', color: '#F26A2E' }}>{pendingTasksCount}</strong>
            </div>
            <div style={{ background: '#FAF8F3', padding: '18px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h4 style={{ color: '#6B7280', fontSize: '12px', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Ethics Clearance</h4>
              <strong style={{ fontSize: '20px', color: ethics.status === 'approved' || ethics.status === 'not_required' ? '#15803D' : '#C08A00' }}>
                {ethics.status === 'approved' ? 'Approved' : ethics.status === 'not_required' ? 'Not Required' : ethics.status === 'required' ? 'Required (Pending)' : 'Unset'}
              </strong>
            </div>
            <div style={{ background: '#FAF8F3', padding: '18px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h4 style={{ color: '#6B7280', fontSize: '12px', textTransform: 'uppercase', margin: '0 0 6px 0' }}>Overall Project Progress</h4>
              <strong style={{ fontSize: '26px', color: '#0F4C81' }}>{overallProgress}%</strong>
            </div>
          </div>

          {/* NAVIGATION TABS */}
          <div style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            borderBottom: '2px solid #E5E7EB',
            paddingBottom: '14px',
            marginBottom: '24px'
          }}>
            {[
              { id: 'kanban', label: 'Task Manager & Kanban Board' },
              { id: 'ethics', label: 'Ethics Decision' },
              { id: 'journals', label: 'Find Suggested Journals' }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: activeTab === tab.id ? '#0F4C81' : '#EAF4FF',
                  color: activeTab === tab.id ? '#ffffff' : '#0F4C81',
                  border: 'none',
                  padding: '10px 18px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: '0.2s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* =========================================================
              TAB 1: ADD A RESEARCH TASK & PROJECT KANBAN BOARD
             ========================================================= */}
          {activeTab === 'kanban' && (
            <div>
              {/* Add Task Box */}
              <div style={{
                background: '#FAF8F3',
                padding: '20px',
                borderRadius: '14px',
                border: '1px solid #E5E7EB',
                marginBottom: '24px'
              }}>
                <h3 style={{ margin: '0 0 14px 0', color: '#0F4C81', fontSize: '1.05rem' }}>Add a Research Task</h3>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                  gap: '12px',
                  alignItems: 'end'
                }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Task Title</label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder="e.g. Draft problem statement"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Research Stage</label>
                    <select
                      value={taskStage}
                      onChange={(e) => setTaskStage(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff' }}
                    >
                      {LIFECYCLE_METADATA.map(s => (
                        <option key={s.number} value={s.title}>{s.number}. {s.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '4px' }}>PMBOK Phase</label>
                    <select
                      value={taskPmPhase}
                      onChange={(e) => setTaskPmPhase(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff' }}
                    >
                      {PM_PHASES.map(phase => (
                        <option key={phase} value={phase}>{phase}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Kanban Column</label>
                    <select
                      value={taskStatus}
                      onChange={(e) => setTaskStatus(e.target.value)}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff' }}
                    >
                      <option value="todo">To Do</option>
                      <option value="progress">In Progress</option>
                      <option value="review">Review</option>
                      <option value="done">Done</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', display: 'block', marginBottom: '4px' }}>Expected Output</label>
                    <input
                      type="text"
                      value={taskOutput}
                      onChange={(e) => setTaskOutput(e.target.value)}
                      placeholder="e.g. 2-page draft"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                    />
                  </div>

                  <div>
                    <button
                      type="button"
                      onClick={handleAddTask}
                      style={{
                        width: '100%',
                        background: '#F26A2E',
                        color: '#fff',
                        border: 'none',
                        padding: '11px 18px',
                        borderRadius: '8px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      + Add Task
                    </button>
                  </div>
                </div>
              </div>

              {/* Filter by Research Stage */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#0F4C81', fontSize: '1.05rem' }}>Project Kanban Board</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#6B7280', fontWeight: 600 }}>Filter by Research Stage:</span>
                  <select
                    value={stageFilter}
                    onChange={(e) => setStageFilter(e.target.value)}
                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #E5E7EB', fontSize: '0.85rem' }}
                  >
                    <option value="ALL">All 11 Research Stages ({tasks.length})</option>
                    {LIFECYCLE_METADATA.map(s => (
                      <option key={s.number} value={s.title}>{s.number}. {s.title}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4-Column Kanban Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '16px'
              }}>
                {[
                  { key: 'todo', title: 'To Do', accent: '#C08A00' },
                  { key: 'progress', title: 'In Progress', accent: '#1E88E5' },
                  { key: 'review', title: 'Review', accent: '#0F4C81' },
                  { key: 'done', title: 'Done', accent: '#15803D' }
                ].map(col => {
                  const colTasks = filteredTasks.filter(t => t.status === col.key);
                  return (
                    <div
                      key={col.key}
                      style={{
                        background: '#F8FAFC',
                        borderRadius: '12px',
                        padding: '14px',
                        border: '1px solid #E5E7EB',
                        borderTop: `4px solid ${col.accent}`,
                        minHeight: '280px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1F2937' }}>{col.title}</h4>
                        <span style={{ background: '#E5E7EB', color: '#1F2937', borderRadius: '999px', padding: '2px 8px', fontSize: '0.75rem', fontWeight: 700 }}>
                          {colTasks.length}
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {colTasks.map(task => (
                          <div
                            key={task.id}
                            style={{
                              background: '#ffffff',
                              padding: '12px',
                              borderRadius: '10px',
                              border: '1px solid #E5E7EB',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px', marginBottom: '6px' }}>
                              <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#0F4C81' }}>{task.title}</h5>
                              <button
                                type="button"
                                onClick={() => handleDeleteTask(task.id)}
                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '1rem', padding: '0 4px', lineHeight: 1 }}
                                title="Delete task"
                              >
                                &times;
                              </button>
                            </div>

                            <p style={{ margin: '0 0 8px 0', fontSize: '0.8rem', color: '#6B7280', lineHeight: 1.4 }}>
                              {task.expected_output || "No expected output specified."}
                            </p>

                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '10px' }}>
                              <span style={{ background: '#EAF4FF', color: '#0F4C81', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 }}>
                                {task.research_stage}
                              </span>
                              <span style={{ background: '#F3F4F6', color: '#4B5563', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 600 }}>
                                PM: {task.pm_phase}
                              </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '6px', borderTop: '1px solid #F3F4F6' }}>
                              {renderBadge(task.status)}
                              <select
                                value={task.status}
                                onChange={(e) => handleMoveTask(task.id, e.target.value)}
                                style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: '6px', border: '1px solid #D1D5DB', background: '#FAF8F3' }}
                              >
                                <option value="todo">To Do</option>
                                <option value="progress">In Progress</option>
                                <option value="review">Review</option>
                                <option value="done">Done</option>
                              </select>
                            </div>
                          </div>
                        ))}

                        {colTasks.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '30px 10px', color: '#9CA3AF', fontSize: '0.8rem', fontStyle: 'italic' }}>
                            No tasks in {col.title}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 2: 11-STAGE RESEARCH LIFECYCLE & PROGRESS TRACKER
             ========================================================= */}
          {activeTab === 'lifecycle' && (
            <div>
              {/* Horizontal Progress Overview Bar */}
              <div style={{
                background: '#0F4C81',
                color: '#ffffff',
                padding: '20px',
                borderRadius: '14px',
                marginBottom: '24px'
              }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: '1rem', color: '#ffffff' }}>
                  Granular Stage Completion Overview
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                  {stages.map(s => (
                    <div key={s.stage_number}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px' }}>
                        <span>{s.stage_number}. {s.stage_name}</span>
                        <strong style={{ color: '#F26A2E' }}>{s.progress}%</strong>
                      </div>
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.22)', borderRadius: '20px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${s.progress}%`, background: '#F26A2E', transition: 'width 0.3s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 11 Lifecycle Stage Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                gap: '16px'
              }}>
                {LIFECYCLE_METADATA.map(meta => {
                  const stageState = stages.find(s => s.stage_number === meta.number) || {
                    stage_number: meta.number,
                    stage_name: meta.title,
                    progress: 0,
                    pm_phase: 'Planning'
                  };
                  const stageTaskCount = tasks.filter(t => t.research_stage === meta.title).length;

                  return (
                    <div
                      key={meta.number}
                      style={{
                        background: '#ffffff',
                        padding: '20px',
                        borderRadius: '16px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                        border: '1px solid #E5E7EB',
                        borderTop: '5px solid #1E88E5',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{
                            background: '#F26A2E',
                            color: '#ffffff',
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '50%',
                            fontWeight: 700,
                            fontSize: '0.9rem'
                          }}>
                            {meta.number}
                          </div>
                          <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>
                            {stageTaskCount} linked {stageTaskCount === 1 ? 'task' : 'tasks'}
                          </span>
                        </div>

                        <h3 style={{ color: '#0F4C81', margin: '0 0 8px 0', fontSize: '1.05rem' }}>{meta.title}</h3>
                        <p style={{ color: '#6B7280', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 12px 0' }}>
                          {meta.desc}
                        </p>

                        <div style={{ marginBottom: '14px' }}>
                          {meta.tags.map(tag => (
                            <span
                              key={tag}
                              style={{
                                display: 'inline-block',
                                background: '#EAF4FF',
                                color: '#0F4C81',
                                padding: '4px 10px',
                                borderRadius: '20px',
                                fontSize: '11px',
                                fontWeight: 600,
                                marginRight: '5px',
                                marginBottom: '5px'
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ paddingTop: '12px', borderTop: '1px solid #F3F4F6' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                          <label style={{ fontSize: '0.72rem', fontWeight: 700, color: '#4B5563' }}>PM Methodology Phase:</label>
                          <select
                            value={stageState.pm_phase}
                            onChange={(e) => handleStageUpdate(meta.number, stageState.progress, e.target.value)}
                            style={{ fontSize: '0.72rem', padding: '3px 6px', borderRadius: '6px', border: '1px solid #D1D5DB' }}
                          >
                            {PM_PHASES.map(p => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, color: '#0F4C81', marginBottom: '4px' }}>
                          <span>Stage Completion</span>
                          <span>{stageState.progress}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          value={stageState.progress}
                          onChange={(e) => handleStageUpdate(meta.number, e.target.value, stageState.pm_phase)}
                          style={{ width: '100%', accentColor: '#F26A2E', cursor: 'pointer' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 3: ETHICS DECISION & GOVERNANCE
             ========================================================= */}
          {activeTab === 'ethics' && (
            <div style={{ background: '#FAF8F3', padding: '22px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#0F4C81' }}>Ethics Decision & Clearance Tracker</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Ethics Status</label>
                  <select
                    value={ethics.status}
                    onChange={(e) => handleSaveEthics({ ...ethics, status: e.target.value })}
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff' }}
                  >
                    <option value="">Select ethics status</option>
                    <option value="not_required">Ethics Not Required</option>
                    <option value="required">Ethics Required</option>
                    <option value="approved">Ethics Approved</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.8rem', fontWeight: 700, display: 'block', marginBottom: '6px' }}>Reason / Data Type</label>
                  <input
                    type="text"
                    value={ethics.reason}
                    onChange={(e) => handleSaveEthics({ ...ethics, reason: e.target.value })}
                    placeholder="Reason e.g. secondary bibliometric data / surveys / interviews"
                    style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB' }}
                  />
                </div>
              </div>

              {(ethics.status === 'required' || ethics.status === 'approved') && (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '15px',
                  marginTop: '18px',
                  paddingTop: '18px',
                  borderTop: '1px dashed #D1D5DB'
                }}>
                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Application / Approval Number</label>
                    <input
                      type="text"
                      value={ethics.approval_number}
                      onChange={(e) => handleSaveEthics({ ...ethics, approval_number: e.target.value })}
                      placeholder="e.g. JBSREC2026-04"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Approval / Submission Date</label>
                    <input
                      type="date"
                      value={ethics.approval_date}
                      onChange={(e) => handleSaveEthics({ ...ethics, approval_date: e.target.value })}
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Ethics Committee Name</label>
                    <input
                      type="text"
                      value={ethics.committee_name}
                      onChange={(e) => handleSaveEthics({ ...ethics, committee_name: e.target.value })}
                      placeholder="e.g. UJ JBS Research Ethics Committee"
                      style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                      Clearance Certificate {ethics.certificate_filename && `(${ethics.certificate_filename})`}
                    </label>
                    <input
                      type="file"
                      onChange={handleEthicsFileUpload}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #E5E7EB', background: '#fff' }}
                    />
                  </div>
                </div>
              )}

              {/* Status Banner */}
              <div style={{
                marginTop: '18px',
                padding: '18px',
                borderRadius: '14px',
                background: '#EAF4FF',
                borderLeft: '6px solid #1E88E5'
              }}>
                {ethics.status === 'not_required' && (
                  <>
                    <h4 style={{ color: '#0F4C81', margin: '0 0 6px 0' }}>Ethics Not Required</h4>
                    <p style={{ color: '#4B5563', margin: '0 0 8px 0', fontSize: '0.88rem' }}>
                      This project may proceed to data collection or analysis because ethical clearance is not required.
                    </p>
                    <span style={{ background: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Proceed</span>
                  </>
                )}
                {ethics.status === 'required' && (
                  <>
                    <h4 style={{ color: '#0F4C81', margin: '0 0 6px 0' }}>Ethics Required</h4>
                    <p style={{ color: '#4B5563', margin: '0 0 8px 0', fontSize: '0.88rem' }}>
                      Ethical clearance is required. Primary data collection should not proceed until formal approval is granted.
                    </p>
                    <span style={{ background: '#FFF3D6', color: '#C08A00', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Awaiting Approval</span>
                  </>
                )}
                {ethics.status === 'approved' && (
                  <>
                    <h4 style={{ color: '#0F4C81', margin: '0 0 6px 0' }}>Ethics Approved</h4>
                    <p style={{ color: '#4B5563', margin: '0 0 8px 0', fontSize: '0.88rem' }}>
                      Ethics approval has been granted. The project may proceed to full data collection and analysis.
                    </p>
                    <span style={{ background: '#DCFCE7', color: '#15803D', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>Approved</span>
                  </>
                )}
                {!ethics.status && (
                  <>
                    <h4 style={{ color: '#0F4C81', margin: '0 0 6px 0' }}>Awaiting Ethics Decision</h4>
                    <p style={{ color: '#4B5563', margin: 0, fontSize: '0.88rem' }}>
                      Select whether ethics is not required, required, or already approved.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 4: RESEARCH ASSISTANT WORKSPACE
             ========================================================= */}
          {activeTab === 'assistant' && (
            <div style={{ background: '#FAF8F3', padding: '22px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#0F4C81' }}>Research Assistant Workspace</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '15px' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Research Stage</label>
                  <select
                    value={selectedAssistantStage}
                    onChange={(e) => handleSelectAssistantStage(e.target.value)}
                    style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff' }}
                  >
                    <option value="problem">Problem Statement & Concept Note</option>
                    <option value="literature">Literature Review</option>
                    <option value="framework">Conceptual & Theoretical Framework</option>
                    <option value="methodology">Methodology</option>
                    <option value="datacollection">Data Collection</option>
                    <option value="dataanalysis">Data Analysis</option>
                    <option value="results">Results & Discussion</option>
                    <option value="conclusion">Conclusion & Recommendations</option>
                    <option value="publication">Submission & Publication</option>
                  </select>
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Research Topic Focus</label>
                  <input
                    type="text"
                    value={assistantTopic}
                    onChange={(e) => setAssistantTopic(e.target.value)}
                    placeholder="Enter your research topic"
                    style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid #E5E7EB' }}
                  />
                </div>
              </div>

              <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                Stage Working Draft / Concept Note / Objectives
              </label>
              <textarea
                rows="5"
                value={assistantDraft}
                onChange={(e) => setAssistantDraft(e.target.value)}
                placeholder="Paste your research idea, problem statement, concept note, objectives, or draft text here..."
                style={{ width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #E5E7EB', marginBottom: '12px' }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px', marginBottom: '18px' }}>
                {noteSavedMsg && <span style={{ color: '#15803D', fontSize: '0.85rem', fontWeight: 700 }}>{noteSavedMsg}</span>}
                <button
                  type="button"
                  onClick={handleSaveNote}
                  style={{ background: '#F26A2E', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Save Stage Draft
                </button>
              </div>

              {/* Structured Stage Guidance */}
              <div style={{
                padding: '18px',
                borderRadius: '14px',
                background: '#EAF4FF',
                borderLeft: '6px solid #1E88E5'
              }}>
                <h4 style={{ color: '#0F4C81', margin: '0 0 8px 0' }}>
                  {ASSISTANT_GUIDANCE[selectedAssistantStage]?.title}
                </h4>
                <p style={{ color: '#4B5563', margin: '0 0 10px 0', fontSize: '0.88rem' }}>
                  <strong>Topic:</strong> {assistantTopic || 'Your study'}
                </p>
                <ul style={{ marginLeft: '20px', color: '#4B5563', lineHeight: 1.7, fontSize: '0.88rem' }}>
                  {ASSISTANT_GUIDANCE[selectedAssistantStage]?.items.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 5: FIND SUGGESTED JOURNALS
             ========================================================= */}
          {activeTab === 'journals' && (
            <div style={{ background: '#FAF8F3', padding: '22px', borderRadius: '14px', border: '1px solid #E5E7EB' }}>
              <h3 style={{ margin: '0 0 15px 0', color: '#0F4C81' }}>Find Suggested Journals</h3>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', marginBottom: '20px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Topic or Keywords</label>
                  <input
                    type="text"
                    value={journalTopic}
                    onChange={(e) => setJournalTopic(e.target.value)}
                    placeholder="Enter topic or keywords"
                    style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid #E5E7EB' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: '0.75rem', fontWeight: 700, display: 'block', marginBottom: '4px' }}>Research Discipline</label>
                  <select
                    value={journalField}
                    onChange={(e) => setJournalField(e.target.value)}
                    style={{ width: '100%', padding: '11px', borderRadius: '10px', border: '1px solid #E5E7EB', background: '#fff' }}
                  >
                    <option value="general">General Research</option>
                    <option value="education">Education</option>
                    <option value="technology">Technology / AI / Information Systems</option>
                    <option value="sustainability">Sustainability / ESG</option>
                    <option value="science">Science / Laboratory Research</option>
                    <option value="business">Business / Management</option>
                  </select>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleFindJournals}
                    style={{ width: '100%', background: '#1E88E5', color: '#fff', border: 'none', padding: '12px 20px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Suggest Journals
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
                {suggestedJournals.length > 0 ? (
                  suggestedJournals.map((j, index) => (
                    <div
                      key={index}
                      style={{
                        background: '#EAF4FF',
                        padding: '18px',
                        borderRadius: '14px',
                        borderLeft: '5px solid #1E88E5'
                      }}
                    >
                      <h4 style={{ color: '#0F4C81', margin: '0 0 8px 0' }}>{j[0]}</h4>
                      <p style={{ color: '#4B5563', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 8px 0' }}>{j[1]}</p>
                      <p style={{ color: '#1F2937', fontSize: '0.82rem', margin: '0 0 8px 0' }}>
                        <strong>Topic fit:</strong> {journalTopic || 'your research topic'}
                      </p>
                      <span style={{ background: '#DDEEFF', color: '#1E88E5', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                        Suggested Outlet
                      </span>
                    </div>
                  ))
                ) : (
                  <div style={{ background: '#EAF4FF', padding: '18px', borderRadius: '14px', borderLeft: '5px solid #1E88E5' }}>
                    <h4 style={{ color: '#0F4C81', margin: '0 0 6px 0' }}>No journals suggested yet</h4>
                    <p style={{ color: '#6B7280', margin: 0, fontSize: '0.85rem' }}>
                      Enter your topic and field above and click "Suggest Journals" to generate publication outlets.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
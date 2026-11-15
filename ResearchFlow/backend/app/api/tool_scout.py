import os
import re
import json
import html
import sqlite3
import asyncio
import urllib.parse
import urllib.request
from datetime import datetime, timedelta
from typing import List, Dict
from fastapi import APIRouter, Query

router = APIRouter()

DB_PATH = os.path.join(os.getcwd(), "researchflow.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH, timeout=15.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_scout_table():
    conn = get_db_connection()
    cursor = conn.cursor()
    # v4 adds is_curated so heavy hitters (Elicit, Scite, etc.) always sort first
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS scouted_tools_v4 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            stage_id TEXT NOT NULL,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            description TEXT,
            source TEXT NOT NULL,
            stars INTEGER DEFAULT 0,
            topics TEXT DEFAULT '',
            is_curated INTEGER DEFAULT 0,
            created_at TEXT DEFAULT '',
            first_seen_at TEXT NOT NULL,
            UNIQUE(stage_id, url)
        )
    """)
    conn.commit()
    conn.close()

init_scout_table()

RESEARCH_STAGE_CONFIG: Dict[str, Dict] = {
    "problem_statement": {
        "label": "Problem Statement",
        "github_query": "literature-review OR research-assistant stars:>15",
        "ddg_query": "academic research question problem statement generator tool",
        "curated_github": [
            {"name": "allenai/scholarphi", "url": "https://github.com/allenai/scholarphi", "description": "AI-powered interactive reader that helps researchers identify definitions, concepts, and gaps across papers.", "stars": 420, "topics": "allenai,research,nlp"},
            {"name": "OpenKnowledgeMaps/Headstart", "url": "https://github.com/OpenKnowledgeMaps/Headstart", "description": "Open-source visualization framework that maps research domains and reveals problem gaps.", "stars": 310, "topics": "knowledge-maps,problem-statement"},
            {"name": "oughtinc/ice", "url": "https://github.com/oughtinc/ice", "description": "Interactive Composition Explorer by Ought (creators of Elicit) for decomposing complex research questions.", "stars": 1150, "topics": "elicit,research-questions,llm"}
        ],
        "curated_web": [
            {"name": "Elicit", "url": "https://elicit.com", "description": "AI research assistant for brainstorming research questions, identifying literature gaps, and formulating problem statements.", "topics": "elicit.com"},
            {"name": "Scite", "url": "https://scite.ai", "description": "Smart citations platform showing how research claims and gaps are supported or contrasted across academic literature.", "topics": "scite.ai"},
            {"name": "Connected Papers", "url": "https://www.connectedpapers.com", "description": "Visual exploration tool to identify unexplored research gaps and prior art around a problem statement.", "topics": "connectedpapers.com"},
            {"name": "OpenKnowledgeMaps", "url": "https://openknowledgemaps.org", "description": "Visual interface to scientific knowledge that clusters research topics and reveals domain gaps.", "topics": "openknowledgemaps.org"}
        ]
    },
    "concept_note": {
        "label": "Concept Note",
        "github_query": "open-science OR academic-writing stars:>15",
        "ddg_query": "academic research concept note proposal builder software tool",
        "curated_github": [
            {"name": "CenterForOpenScience/osf.io", "url": "https://github.com/CenterForOpenScience/osf.io", "description": "Open Science Framework platform for registering research concept notes, study protocols, and workflows.", "stars": 760, "topics": "open-science,concept-note,protocol"},
            {"name": "executablebooks/mystmd", "url": "https://github.com/executablebooks/mystmd", "description": "Scientific markdown engine for authoring structured concept notes, proposals, and reproducible manuscripts.", "stars": 690, "topics": "scientific-writing,proposals"},
            {"name": "CDLUC3/dmptool", "url": "https://github.com/CDLUC3/dmptool", "description": "Open-source tool for generating structured research concept notes and data management plans.", "stars": 145, "topics": "research-proposal,concept-note"}
        ],
        "curated_web": [
            {"name": "Elicit", "url": "https://elicit.com", "description": "Rapidly scope concept notes, extract study methodologies, and synthesize background rationale from papers.", "topics": "elicit.com"},
            {"name": "Scite", "url": "https://scite.ai", "description": "Validate your concept note's core claims with Smart Citations showing supporting and contrasting evidence.", "topics": "scite.ai"},
            {"name": "OSF (Open Science Framework)", "url": "https://osf.io", "description": "Open-source project management and preregistration platform for structuring concept notes and study protocols.", "topics": "osf.io"},
            {"name": "Authorea", "url": "https://www.authorea.com", "description": "Collaborative academic document platform for drafting concept notes and research proposals.", "topics": "authorea.com"}
        ]
    },
    "literature_review": {
        "label": "Literature Review",
        "github_query": "systematic-review OR bibliometrics stars:>15",
        "ddg_query": "academic literature review citation mapping software tool",
        "curated_github": [
            {"name": "asreview/asreview", "url": "https://github.com/asreview/asreview", "description": "Active learning for systematic reviews and automated literature screening.", "stars": 1650, "topics": "systematic-review,literature-review,active-learning"},
            {"name": "Future-House/paper-qa", "url": "https://github.com/Future-House/paper-qa", "description": "High-accuracy RAG package for performing literature reviews and question answering with citations over PDFs.", "stars": 6400, "topics": "literature-review,scientific-rag"},
            {"name": "MaastrichtU-IDS/litstudy", "url": "https://github.com/MaastrichtU-IDS/litstudy", "description": "Python package for analyzing and plotting scientific literature corpora from Scopus and CrossRef.", "stars": 380, "topics": "bibliometrics,literature-review,scopus"}
        ],
        "curated_web": [
            {"name": "Elicit", "url": "https://elicit.com", "description": "Automate systematic literature reviews, extract data tables across papers, and synthesize themes.", "topics": "elicit.com"},
            {"name": "Scite", "url": "https://scite.ai", "description": "Discover whether papers in your literature review have been supported or contradicted by subsequent studies.", "topics": "scite.ai"},
            {"name": "ResearchRabbit", "url": "https://www.researchrabbit.ai", "description": "Citation-based literature mapping tool for discovering forward and backward academic references.", "topics": "researchrabbit.ai"},
            {"name": "Litmaps", "url": "https://www.litmaps.com", "description": "Interactive citation discovery and dynamic literature mapping platform with automated alerts for new papers.", "topics": "litmaps.com"},
            {"name": "Rayyan", "url": "https://www.rayyan.ai", "description": "Collaborative web platform for systematic literature reviews and fast abstract screening.", "topics": "rayyan.ai"}
        ]
    },
    "frameworks": {
        "label": "Conceptual & Theoretical Framework",
        "github_query": "causal-inference OR concept-map stars:>15",
        "ddg_query": "academic conceptual theoretical framework diagram mapping tool",
        "curated_github": [
            {"name": "py-why/dowhy", "url": "https://github.com/py-why/dowhy", "description": "Python library for causal inference that models explicit theoretical assumptions and causal graphs.", "stars": 7200, "topics": "causal-graphs,theoretical-model"},
            {"name": "jtextor/dagitty", "url": "https://github.com/jtextor/dagitty", "description": "Graphical analysis of structural causal models and theoretical frameworks.", "stars": 340, "topics": "causal-inference,conceptual-framework,dag"},
            {"name": "cytoscape/cytoscape.js", "url": "https://github.com/cytoscape/cytoscape.js", "description": "Graph theory and network library for visualizing conceptual constructs and relationships.", "stars": 10200, "topics": "network-graph,concept-mapping"}
        ],
        "curated_web": [
            {"name": "DAGitty", "url": "http://www.dagitty.net", "description": "Browser-based environment for creating, editing, and analyzing causal diagrams and theoretical models.", "topics": "dagitty.net"},
            {"name": "Kumu", "url": "https://kumu.io", "description": "Relationship mapping and conceptual systems visualization platform for complex theoretical frameworks.", "topics": "kumu.io"},
            {"name": "Connected Papers", "url": "https://www.connectedpapers.com", "description": "Trace foundational theoretical papers and construct genealogy clusters for your framework.", "topics": "connectedpapers.com"}
        ]
    },
    "methodology": {
        "label": "Methodology",
        "github_query": "experimental-design OR power-analysis stars:>15",
        "ddg_query": "research methodology sample size calculator experimental design tool",
        "curated_github": [
            {"name": "DeclareDesign/DeclareDesign", "url": "https://github.com/DeclareDesign/DeclareDesign", "description": "Software for declaring, diagnosing, and redesigning quantitative and qualitative research methodologies.", "stars": 260, "topics": "research-design,methodology,power-analysis"},
            {"name": "statsmodels/statsmodels", "url": "https://github.com/statsmodels/statsmodels", "description": "Statistical modeling and power analysis modules for rigorous research design.", "stars": 10100, "topics": "statistics,power-analysis,methodology"},
            {"name": "psychopy/psychopy", "url": "https://github.com/psychopy/psychopy", "description": "Open-source package for designing and running behavioral and experimental research protocols.", "stars": 1850, "topics": "experimental-design,methodology"}
        ],
        "curated_web": [
            {"name": "Elicit", "url": "https://elicit.com", "description": "Extract and compare methodology matrices (sample size, instruments, study design) across hundreds of papers.", "topics": "elicit.com"},
            {"name": "G*Power", "url": "https://www.psychologie.hhu.de/arbeitsgruppen/allgemeine-psychologie-und-arbeitspsychologie/gpower", "description": "Statistical power analysis and sample size calculation tool for quantitative research designs.", "topics": "hhu.de"},
            {"name": "AsPredicted", "url": "https://aspredicted.org", "description": "Platform for pre-registering research methodology, hypotheses, and analysis plans.", "topics": "aspredicted.org"},
            {"name": "DeclareDesign", "url": "https://declaredesign.org", "description": "Software suite for declaring, diagnosing, and redesigning research methodologies.", "topics": "declaredesign.org"}
        ]
    },
    "ethics_decision": {
        "label": "Ethics Decision",
        "github_query": "data-anonymization OR differential-privacy stars:>15",
        "ddg_query": "academic research ethics data anonymization tool",
        "curated_github": [
            {"name": "arx-deidentifier/arx", "url": "https://github.com/arx-deidentifier/arx", "description": "Comprehensive open-source software for anonymizing sensitive personal data in research datasets.", "stars": 890, "topics": "anonymization,privacy,research-ethics"},
            {"name": "microsoft/presidio", "url": "https://github.com/microsoft/presidio", "description": "Context-aware PII de-identification and anonymization tool for text and research transcripts.", "stars": 3600, "topics": "pii-removal,ethics,anonymization"},
            {"name": "OpenDP/opendp", "url": "https://github.com/OpenDP/opendp", "description": "Open-source suite of differential privacy tools for sharing sensitive academic research data safely.", "stars": 620, "topics": "differential-privacy,ethics"}
        ],
        "curated_web": [
            {"name": "ARX Data Anonymization Tool", "url": "https://arx.deidentifier.org", "description": "Comprehensive open-source software for anonymizing sensitive personal data in research datasets.", "topics": "deidentifier.org"},
            {"name": "Amnesia (OpenAIRE)", "url": "https://amnesia.openaire.eu", "description": "Data anonymization tool that transforms relational and transactional databases into k-anonymous datasets.", "topics": "openaire.eu"}
        ]
    },
    "data_collection": {
        "label": "Data Collection",
        "github_query": "kobotoolbox OR limesurvey OR odk stars:>15",
        "ddg_query": "academic research data collection survey fieldwork software tool",
        "curated_github": [
            {"name": "kobotoolbox/kpi", "url": "https://github.com/kobotoolbox/kpi", "description": "Open-source suite of tools for field data collection and academic surveys.", "stars": 410, "topics": "data-collection,surveys,fieldwork"},
            {"name": "LimeSurvey/LimeSurvey", "url": "https://github.com/LimeSurvey/LimeSurvey", "description": "Open-source online survey application for academic and institutional data collection.", "stars": 2800, "topics": "survey,data-collection,research"},
            {"name": "getodk/central", "url": "https://github.com/getodk/central", "description": "ODK Central server for managing offline and mobile field data collection campaigns.", "stars": 320, "topics": "odk,field-data,collection"}
        ],
        "curated_web": [
            {"name": "KoBoToolbox", "url": "https://www.kobotoolbox.org", "description": "Free open-source suite of tools for field data collection and academic surveys.", "topics": "kobotoolbox.org"},
            {"name": "REDCap", "url": "https://www.project-redcap.org", "description": "Secure web application for building and managing online surveys and research databases.", "topics": "project-redcap.org"},
            {"name": "LimeSurvey", "url": "https://www.limesurvey.org", "description": "Open-source online statistical survey web app for academic data collection.", "topics": "limesurvey.org"}
        ]
    },
    "data_cleaning": {
        "label": "Data Cleaning",
        "github_query": "OpenRefine OR data-cleaning stars:>20",
        "ddg_query": "open source research data cleaning wrangling software tool",
        "curated_github": [
            {"name": "OpenRefine/OpenRefine", "url": "https://github.com/OpenRefine/OpenRefine", "description": "Free, open-source power tool for working with messy data and improving dataset quality.", "stars": 10600, "topics": "data-cleaning,openrefine,wrangling"},
            {"name": "pyjanitor-devs/pyjanitor", "url": "https://github.com/pyjanitor-devs/pyjanitor", "description": "Clean API for cleaning and transforming pandas DataFrames in reproducible research pipelines.", "stars": 1450, "topics": "data-cleaning,python,pandas"},
            {"name": "simonw/datasette", "url": "https://github.com/simonw/datasette", "description": "Open-source multi-tool for exploring, auditing, and cleaning SQLite and CSV research datasets.", "stars": 9200, "topics": "sqlite,data-cleaning,exploration"}
        ],
        "curated_web": [
            {"name": "OpenRefine", "url": "https://openrefine.org", "description": "Powerful free, open-source tool for working with messy data: cleaning, transforming, and reconciling datasets.", "topics": "openrefine.org"},
            {"name": "Datasette", "url": "https://datasette.io", "description": "Open-source multi-tool for exploring, cleaning, and publishing structured SQLite and CSV research data.", "topics": "datasette.io"}
        ]
    },
    "data_analysis": {
        "label": "Data Analysis",
        "github_query": "jamovi OR jasp-desktop OR taguette stars:>15",
        "ddg_query": "open source qualitative quantitative data analysis software tool academic",
        "curated_github": [
            {"name": "jamovi/jamovi", "url": "https://github.com/jamovi/jamovi", "description": "Free and open statistical platform built on R for intuitive academic data analysis.", "stars": 1500, "topics": "statistics,r,data-analysis"},
            {"name": "jasp-stats/jasp-desktop", "url": "https://github.com/jasp-stats/jasp-desktop", "description": "Open-source statistical software supporting both frequentist and Bayesian analysis.", "stars": 1250, "topics": "bayesian,statistics,data-analysis"},
            {"name": "remram44/taguette", "url": "https://github.com/remram44/taguette", "description": "Free and open-source qualitative data analysis tool for coding transcripts and documents.", "stars": 920, "topics": "qualitative-analysis,coding,qda"}
        ],
        "curated_web": [
            {"name": "JASP", "url": "https://jasp-stats.org", "description": "Free and user-friendly open-source statistical software supporting both frequentist and Bayesian analyses.", "topics": "jasp-stats.org"},
            {"name": "jamovi", "url": "https://www.jamovi.org", "description": "Open statistical spreadsheet built on top of the R statistical language for academic data analysis.", "topics": "jamovi.org"},
            {"name": "Taguette", "url": "https://www.taguette.org", "description": "Free and open-source qualitative data analysis tool for highlighting and coding interview transcripts.", "topics": "taguette.org"},
            {"name": "VOSviewer", "url": "https://www.vosviewer.com", "description": "Software tool for constructing and visualizing bibliometric networks and co-occurrence clusters.", "topics": "vosviewer.com"}
        ]
    },
    "findings_and_results": {
        "label": "Findings & Results",
        "github_query": "rawgraphs OR SciencePlots stars:>20",
        "ddg_query": "scientific visualization publication ready graphs software tool",
        "curated_github": [
            {"name": "garrettj403/SciencePlots", "url": "https://github.com/garrettj403/SciencePlots", "description": "Matplotlib styles for formatting scientific figures for IEEE, Nature, and academic journals.", "stars": 12400, "topics": "matplotlib,scientific-figures,latex"},
            {"name": "rawgraphs/rawgraphs-app", "url": "https://github.com/rawgraphs/rawgraphs-app", "description": "Open-source data visualization framework built to create custom vector-based charts for publications.", "stars": 7100, "topics": "visualization,svg,publication-plots"}
        ],
        "curated_web": [
            {"name": "RAWGraphs", "url": "https://www.rawgraphs.io", "description": "Open-source data visualization framework built to create custom vector-based visualizations for publications.", "topics": "rawgraphs.io"},
            {"name": "Datawrapper", "url": "https://www.datawrapper.de", "description": "Create interactive and print-ready charts, maps, and tables for research findings.", "topics": "datawrapper.de"},
            {"name": "Scite", "url": "https://scite.ai", "description": "Contextualize your empirical findings by checking how similar results were cited and debated.", "topics": "scite.ai"}
        ]
    },
    "discussion": {
        "label": "Discussion",
        "github_query": "paper-qa OR scientific-rag OR citation-network stars:>15",
        "ddg_query": "academic citation context discussion synthesis software tool",
        "curated_github": [
            {"name": "Future-House/paper-qa", "url": "https://github.com/Future-House/paper-qa", "description": "High-accuracy RAG for comparing your findings against published literature with exact citations.", "stars": 6400, "topics": "discussion,citations,rag"},
            {"name": "allenai/scholarphi", "url": "https://github.com/allenai/scholarphi", "description": "AI-powered reader for cross-checking definitions, claims, and theoretical implications across papers.", "stars": 420, "topics": "allenai,discussion,claims"},
            {"name": "Zettlr/Zettlr", "url": "https://github.com/Zettlr/Zettlr", "description": "Academic Markdown editor with Zettelkasten linking and Zotero integration for drafting discussions.", "stars": 10300, "topics": "academic-writing,zotero,discussion"}
        ],
        "curated_web": [
            {"name": "Scite", "url": "https://scite.ai", "description": "Essential for Discussion sections: see supporting vs. contrasting citations to compare your findings with prior studies.", "topics": "scite.ai"},
            {"name": "Elicit", "url": "https://elicit.com", "description": "Synthesize how prior studies interpret similar results, limitations, and theoretical implications.", "topics": "elicit.com"},
            {"name": "Consensus", "url": "https://consensus.app", "description": "Academic search engine that gauges scientific consensus across peer-reviewed studies to back up discussion claims.", "topics": "consensus.app"},
            {"name": "Connected Papers", "url": "https://www.connectedpapers.com", "description": "Find derivative works and recent follow-up studies to situate your findings in the broader literature.", "topics": "connectedpapers.com"}
        ]
    },
    "writing": {
        "label": "Writing & Manuscript Drafting",
        "github_query": "typst OR zettlr OR overleaf stars:>20",
        "ddg_query": "academic writing manuscript editor reference manager software tool",
        "curated_github": [
            {"name": "typst/typst", "url": "https://github.com/typst/typst", "description": "Modern markup-based typesetting system that is powerful and easy to learn for scientific manuscripts.", "stars": 34500, "topics": "typesetting,latex-alternative,academic"},
            {"name": "overleaf/overleaf", "url": "https://github.com/overleaf/overleaf", "description": "Open-source web-based collaborative LaTeX editor for scientific manuscripts.", "stars": 14200, "topics": "latex,collaborative-writing,manuscript"},
            {"name": "Zettlr/Zettlr", "url": "https://github.com/Zettlr/Zettlr", "description": "Markdown editor tailored for academic researchers with Zotero citation integration.", "stars": 10300, "topics": "markdown,academic-writing,zettelkasten"}
        ],
        "curated_web": [
            {"name": "Zotero", "url": "https://www.zotero.org", "description": "Free, easy-to-use tool to help you collect, organize, annotate, cite, and share research.", "topics": "zotero.org"},
            {"name": "Overleaf", "url": "https://www.overleaf.com", "description": "Collaborative cloud-based LaTeX editor used for writing, editing, and publishing scientific documents.", "topics": "overleaf.com"},
            {"name": "Scite", "url": "https://scite.ai", "description": "Citation assistant that verifies every reference in your manuscript draft is accurately supported.", "topics": "scite.ai"},
            {"name": "Paperpal", "url": "https://paperpal.com", "description": "Academic writing and language editing tool tailored for scholarly manuscripts and journal compliance.", "topics": "paperpal.com"}
        ]
    },
    "conclusion": {
        "label": "Conclusion & Recommendations",
        "github_query": "paper-qa OR research-summarization stars:>15",
        "ddg_query": "academic research synthesis summarization tool platform",
        "curated_github": [
            {"name": "Future-House/paper-qa", "url": "https://github.com/Future-House/paper-qa", "description": "High-accuracy RAG package for synthesizing conclusions with citations from scientific PDFs.", "stars": 6400, "topics": "scientific-rag,citations,synthesis"}
        ],
        "curated_web": [
            {"name": "Scite", "url": "https://scite.ai", "description": "Smart citations platform that shows how research claims are supported or contrasted across the literature.", "topics": "scite.ai"},
            {"name": "Elicit", "url": "https://elicit.com", "description": "Synthesize overarching conclusions, policy recommendations, and future research directions across studies.", "topics": "elicit.com"},
            {"name": "Consensus", "url": "https://consensus.app", "description": "Academic search engine that synthesizes conclusions across peer-reviewed studies.", "topics": "consensus.app"},
            {"name": "Scholarcy", "url": "https://www.scholarcy.com", "description": "Article summarizer that extracts key findings, limitations, and future directions from academic papers.", "topics": "scholarcy.com"}
        ]
    },
    "review_and_submission": {
        "label": "Review & Submission",
        "github_query": "openjournals OR quarto-cli stars:>15",
        "ddg_query": "academic journal finder manuscript submission formatting tool",
        "curated_github": [
            {"name": "quarto-dev/quarto-cli", "url": "https://github.com/quarto-dev/quarto-cli", "description": "Open-source scientific and technical publishing system that formats manuscripts for top journals.", "stars": 3900, "topics": "journal-templates,publishing,quarto"},
            {"name": "openjournals/joss", "url": "https://github.com/openjournals/joss", "description": "The Journal of Open Source Software — developer-friendly peer review and academic submission system.", "stars": 1350, "topics": "peer-review,open-access,publishing"}
        ],
        "curated_web": [
            {"name": "JANE (Journal/Author Name Estimator)", "url": "https://jane.biosemantics.org", "description": "Paste your abstract or title to find matching indexed journals for manuscript submission.", "topics": "biosemantics.org"},
            {"name": "Think. Check. Submit.", "url": "https://thinkchecksubmit.org", "description": "Verification tool helping researchers identify trusted journals and avoid predatory publishers.", "topics": "thinkchecksubmit.org"},
            {"name": "Sherpa Romeo", "url": "https://www.sherpa.ac.uk/romeo/", "description": "Resource analyzing publisher open-access policies and self-archiving permissions prior to submission.", "topics": "sherpa.ac.uk"}
        ]
    }
}

STAGE_ALIASES = {
    "step_1": "problem_statement",
    "step_2": "data_collection",
    "step_3": "literature_review",
    "step_4": "frameworks",
    "step_5": "findings_and_results",
    "step_6": "conclusion",
    "problem": "problem_statement",
    "problem_statement": "problem_statement",
    "introduction": "problem_statement",
    "background": "problem_statement",
    "concept": "concept_note",
    "concept_note": "concept_note",
    "proposal": "concept_note",
    "literature": "literature_review",
    "literature_review": "literature_review",
    "lit_review": "literature_review",
    "framework": "frameworks",
    "frameworks": "frameworks",
    "conceptual_framework": "frameworks",
    "theoretical_framework": "frameworks",
    "methodology": "methodology",
    "methods": "methodology",
    "research_design": "methodology",
    "ethics": "ethics_decision",
    "ethics_decision": "ethics_decision",
    "datacollection": "data_collection",
    "data_collection": "data_collection",
    "datacleaning": "data_cleaning",
    "data_cleaning": "data_cleaning",
    "dataanalysis": "data_analysis",
    "data_analysis": "data_analysis",
    "analysis": "data_analysis",
    "results": "findings_and_results",
    "findings": "findings_and_results",
    "findings_and_results": "findings_and_results",
    "discussion": "discussion",
    "results_and_discussion": "discussion",
    "writing": "writing",
    "writing_tracker": "writing",
    "drafting": "writing",
    "abstract": "writing",
    "conclusion": "conclusion",
    "conclusions": "conclusion",
    "conclusion_and_recommendations": "conclusion",
    "recommendations": "conclusion",
    "submission": "review_and_submission",
    "publication": "review_and_submission",
    "review": "review_and_submission",
    "review_and_submission": "review_and_submission",
    "references": "writing"
}

def resolve_stage_config(raw_stage_id: str) -> Dict:
    normalized = re.sub(r"[^a-z0-9]+", "_", (raw_stage_id or "").lower()).strip("_")
    canonical_key = STAGE_ALIASES.get(normalized)

    # Substring matching if a stage has a longer title like "Chapter 4: Data Analysis"
    if not canonical_key:
        for alias, target in STAGE_ALIASES.items():
            if alias in normalized:
                canonical_key = target
                break

    if canonical_key and canonical_key in RESEARCH_STAGE_CONFIG:
        return {"canonical_key": canonical_key, **RESEARCH_STAGE_CONFIG[canonical_key]}

    human_label = (raw_stage_id or "Research").replace("_", " ").replace("-", " ").title()
    clean_term = (raw_stage_id or "research").replace("_", " ").replace("-", " ")
    return {
        "canonical_key": normalized or "literature_review",
        "label": human_label,
        "github_query": f"{clean_term} research stars:>10",
        "ddg_query": f"{clean_term} academic research software tool",
        "curated_github": RESEARCH_STAGE_CONFIG["literature_review"]["curated_github"],
        "curated_web": RESEARCH_STAGE_CONFIG["literature_review"]["curated_web"]
    }

SEO_SPAM_PATTERNS = re.compile(
    r"(\btop\s+\d+\b|\bbest\s+\d+\b|\b\d+\s+best\b|\balternatives\s+to\b|"
    r"\bhow\s+to\b|\bultimate\s+guide\b|\breview\s+202\d\b|\bexamples\s+of\b)",
    re.IGNORECASE
)

BLOCKED_DOMAINS = [
    "medium.com", "quora.com", "reddit.com", "youtube.com", "linkedin.com",
    "forbes.com", "zapier.com", "g2.com", "capterra.com", "trustpilot.com",
    "wikipedia.org", "pinterest.com", "scribbr.com", "grammarly.com"
]

def unwrap_ddg_url(href: str) -> str:
    if not href:
        return ""
    if href.startswith("//"):
        href = "https:" + href
    parsed = urllib.parse.urlparse(href)
    if "duckduckgo.com" in parsed.netloc:
        qs = urllib.parse.parse_qs(parsed.query)
        if "uddg" in qs and qs["uddg"]:
            return urllib.parse.unquote(qs["uddg"][0])
    return href

def is_seo_spam(title: str, url: str) -> bool:
    lower_url = url.lower()
    if any(domain in lower_url for domain in BLOCKED_DOMAINS):
        return True
    if SEO_SPAM_PATTERNS.search(title):
        return True
    if "/blog/" in lower_url or "/articles/" in lower_url or "/news/" in lower_url:
        return True
    return False

def clean_tool_name(raw_title: str, url: str) -> str:
    parts = re.split(r"\s+[\|\-—:]\s+", raw_title)
    candidate = parts[0].strip() if parts else raw_title.strip()
    if len(candidate) > 45 or len(candidate) < 2:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc.replace("www.", "")
    return candidate

def _sync_fetch_github(query_str: str, curated_list: List[Dict], limit: int = 8) -> List[Dict]:
    tools = []
    seen_urls = set()

    # 1. Pin curated GitHub tools first (is_curated = 1)
    if curated_list:
        for c in curated_list:
            if c["url"] not in seen_urls:
                seen_urls.add(c["url"])
                tools.append({
                    "name": c["name"],
                    "url": c["url"],
                    "description": c["description"],
                    "source": "github",
                    "stars": c.get("stars", 100),
                    "topics": c.get("topics", "open-source,research"),
                    "is_curated": 1,
                    "created_at": datetime.utcnow().strftime("%Y-%m-%d")
                })

    # 2. Sort by STARS (not updated) so 1-star spam repos never surface
    encoded_q = urllib.parse.quote(query_str)
    url = f"https://api.github.com/search/repositories?q={encoded_q}&sort=stars&order=desc&per_page=10"
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "ResearchFlow-Scout/1.0"
    })
    try:
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            if resp.status == 200:
                payload = json.loads(resp.read().decode("utf-8", errors="ignore"))
                for item in payload.get("items", []):
                    html_url = item.get("html_url", "")
                    stars = item.get("stargazers_count", 0)
                    if stars < 5:
                        continue
                    if html_url and html_url not in seen_urls:
                        seen_urls.add(html_url)
                        tools.append({
                            "name": item.get("full_name", item.get("name", "Unknown Repo")),
                            "url": html_url,
                            "description": item.get("description") or "Open-source research repository on GitHub.",
                            "source": "github",
                            "stars": stars,
                            "topics": ",".join(item.get("topics", [])[:4]),
                            "is_curated": 0,
                            "created_at": (item.get("created_at") or "")[:10]
                        })
                    if len(tools) >= limit:
                        break
    except Exception as e:
        print(f"[ToolScout] Live GitHub API note: {e}")

    return tools[:limit]

def _sync_fetch_ddg(query_str: str, curated_list: List[Dict], limit: int = 8) -> List[Dict]:
    cleaned_tools = []
    seen_domains = set()

    # 1. Pin Heavy Hitters (Elicit, Scite, Consensus, etc.) at the top (is_curated = 1)
    if curated_list:
        for fb in curated_list:
            fb_domain = fb.get("topics", "")
            if fb_domain not in seen_domains:
                seen_domains.add(fb_domain)
                cleaned_tools.append({
                    "name": fb["name"],
                    "url": fb["url"],
                    "description": fb["description"],
                    "source": "duckduckgo",
                    "stars": 0,
                    "topics": fb_domain,
                    "is_curated": 1,
                    "created_at": datetime.utcnow().strftime("%Y-%m-%d")
                })

    # 2. Fetch live discoveries from DuckDuckGo
    raw_results = []
    try:
        data = urllib.parse.urlencode({"q": query_str}).encode("utf-8")
        req = urllib.request.Request(
            "https://html.duckduckgo.com/html/",
            data=data,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml",
                "Referer": "https://html.duckduckgo.com/"
            }
        )
        with urllib.request.urlopen(req, timeout=8.0) as resp:
            page_html = resp.read().decode("utf-8", errors="ignore")
            link_matches = re.findall(
                r'<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>(.*?)</a>',
                page_html,
                flags=re.DOTALL | re.IGNORECASE
            )
            snip_matches = re.findall(
                r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>',
                page_html,
                flags=re.DOTALL | re.IGNORECASE
            )
            for idx, (href, raw_title) in enumerate(link_matches[:15]):
                clean_title = html.unescape(re.sub(r"<[^>]+>", "", raw_title)).strip()
                raw_snip = snip_matches[idx] if idx < len(snip_matches) else ""
                clean_snip = html.unescape(re.sub(r"<[^>]+>", "", raw_snip)).strip()
                raw_results.append({"title": clean_title, "href": html.unescape(href), "body": clean_snip})
    except Exception as e:
        print(f"[ToolScout] Live DuckDuckGo note: {e}")

    for item in raw_results:
        if len(cleaned_tools) >= limit:
            break

        title = item.get("title", "")
        real_url = unwrap_ddg_url(item.get("href", ""))
        snippet = item.get("body", "")

        if not real_url or not real_url.startswith("http") or not title:
            continue
        if is_seo_spam(title, real_url):
            continue

        domain = urllib.parse.urlparse(real_url).netloc.replace("www.", "")
        if not domain or "duckduckgo.com" in domain or domain in seen_domains:
            continue
        seen_domains.add(domain)

        cleaned_tools.append({
            "name": clean_tool_name(title, real_url),
            "url": real_url,
            "description": snippet or title,
            "source": "duckduckgo",
            "stars": 0,
            "topics": domain,
            "is_curated": 0,
            "created_at": datetime.utcnow().strftime("%Y-%m-%d")
        })

    return cleaned_tools[:limit]

@router.get("/projects/{project_id}/stages/{stage_id}/tool-scout")
async def get_stage_tool_scout(
    project_id: str,
    stage_id: str,
    refresh: bool = Query(False, description="Force live re-scan of GitHub & DuckDuckGo")
):
    config = resolve_stage_config(stage_id)
    canonical_stage = config["canonical_key"]

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT * FROM scouted_tools_v4 WHERE stage_id = ? ORDER BY is_curated DESC, stars DESC, id ASC",
        (canonical_stage,)
    )
    existing_rows = [dict(r) for r in cursor.fetchall()]

    has_github = any(r["source"] == "github" for r in existing_rows)
    has_ddg = any(r["source"] == "duckduckgo" for r in existing_rows)

    new_discoveries_count = 0
    now_str = datetime.utcnow().isoformat()
    existing_urls = {r["url"] for r in existing_rows}

    newly_fetched = []

    if not has_github or refresh:
        gh_tools = await asyncio.to_thread(
            _sync_fetch_github,
            config["github_query"],
            config.get("curated_github", []),
            8
        )
        newly_fetched.extend(gh_tools)

    if not has_ddg or refresh:
        ddg_tools = await asyncio.to_thread(
            _sync_fetch_ddg,
            config["ddg_query"],
            config.get("curated_web", []),
            8
        )
        newly_fetched.extend(ddg_tools)

    if newly_fetched:
        for t in newly_fetched:
            if t["url"] and t["url"] not in existing_urls:
                cursor.execute(
                    """INSERT OR IGNORE INTO scouted_tools_v4
                       (stage_id, name, url, description, source, stars, topics, is_curated, created_at, first_seen_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        canonical_stage,
                        t["name"],
                        t["url"],
                        t["description"],
                        t["source"],
                        t["stars"],
                        t["topics"],
                        t.get("is_curated", 0),
                        t["created_at"],
                        now_str
                    )
                )
                if cursor.rowcount > 0:
                    new_discoveries_count += 1
                    existing_urls.add(t["url"])

        conn.commit()
        cursor.execute(
            "SELECT * FROM scouted_tools_v4 WHERE stage_id = ? ORDER BY is_curated DESC, stars DESC, id ASC",
            (canonical_stage,)
        )
        existing_rows = [dict(r) for r in cursor.fetchall()]

    conn.close()

    formatted_tools = []
    cutoff = datetime.utcnow() - timedelta(hours=24)

    for r in existing_rows:
        try:
            seen_dt = datetime.fromisoformat(r["first_seen_at"])
            is_new = seen_dt >= cutoff
        except Exception:
            is_new = False

        topics_list = [x.strip() for x in (r["topics"] or "").split(",") if x.strip()]
        formatted_tools.append({
            "id": r["id"],
            "name": r["name"],
            "url": r["url"],
            "description": r["description"],
            "source": r["source"],
            "stars": r["stars"],
            "topics": topics_list,
            "is_curated": bool(r.get("is_curated", 0)),
            "created_at": r["created_at"],
            "first_seen_at": r["first_seen_at"][:10],
            "is_new": is_new
        })

    return {
        "status": "success",
        "stage_label": config["label"],
        "new_discoveries": new_discoveries_count,
        "tools": formatted_tools
    }
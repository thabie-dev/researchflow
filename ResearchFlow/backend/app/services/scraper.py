import os
import json
import time
import re
import math
import itertools
from datetime import datetime
from typing import List, Dict, Optional, Set
import requests
import arxiv
import sqlite3

from app.core.config import Settings
from app.services.storage import get_project_dir, update_pipeline_state

# Unify the DB Path with the rest of the application
DB_PATH = Settings.from_environment().database_path

class PipelinePaperScraper:
    def __init__(self, project_id: str):
        self.project_id = str(project_id)
        self.proj_dir = get_project_dir(self.project_id)
        self.headers = {'User-Agent': 'ResearchFlow-Academic-Pipeline/1.0 (mailto:researchflow@internal)'}
        self.delay = 1.0
        self.max_retries = 3
        self.pdf_delay = 1.5

    def _ensure_tables(self):
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS papers (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    doi TEXT,
                    title TEXT NOT NULL,
                    authors TEXT,
                    year INTEGER,
                    source TEXT NOT NULL,
                    journal TEXT,
                    abstract TEXT,
                    pdf_path TEXT,
                    metadata_json TEXT,
                    status TEXT DEFAULT 'acquired',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_papers_project ON papers(project_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_papers_doi ON papers(doi)")
            conn.commit()

    @staticmethod
    def expand_boolean_query(query: str) -> List[str]:
        tokens = []
        i, n = 0, len(query)
        while i < n:
            ch = query[i]
            if ch == '"':
                j = i + 1
                while j < n and query[j] != '"':
                    j += 1
                tokens.append(query[i:j+1])
                i = j + 1
            elif ch in '()':
                tokens.append(ch)
                i += 1
            elif query[i:i+3].upper() == 'AND':
                tokens.append('AND')
                i += 3
            elif query[i:i+2].upper() == 'OR':
                tokens.append('OR')
                i += 2
            elif ch.isspace():
                i += 1
            else:
                j = i
                while j < n and not query[j].isspace() and query[j] not in '()':
                    j += 1
                tokens.append(query[i:j])
                i = j

        def parse_expression(tok_list, pos):
            terms = []
            while pos < len(tok_list):
                if tok_list[pos] == ')':
                    break
                term, pos = parse_term(tok_list, pos)
                terms.append(term)
                if pos < len(tok_list) and tok_list[pos] == 'OR':
                    pos += 1
                else:
                    break
            return (terms[0] if len(terms) == 1 else ('or', terms)), pos

        def parse_term(tok_list, pos):
            factors = []
            while pos < len(tok_list) and tok_list[pos] not in ('OR', ')'):
                if tok_list[pos] == '(':
                    pos += 1
                    sub, pos = parse_expression(tok_list, pos)
                    if pos < len(tok_list) and tok_list[pos] == ')':
                        pos += 1
                    factors.append(sub)
                else:
                    factors.append(tok_list[pos])
                    pos += 1
                if pos < len(tok_list) and tok_list[pos] == 'AND':
                    pos += 1
            return (factors[0] if len(factors) == 1 else ('and', factors)), pos

        ast, _ = parse_expression(tokens, 0)

        def generate(node):
            if isinstance(node, str):
                return [node.strip('"')]
            elif isinstance(node, tuple) and node[0] == 'or':
                res = []
                for child in node[1]:
                    res.extend(generate(child))
                return res
            elif isinstance(node, tuple) and node[0] == 'and':
                parts = [generate(child) for child in node[1]]
                return [' '.join(comb) for comb in itertools.product(*parts)]
            return [str(node)]

        expanded = [q for q in set(generate(ast)) if q.strip()]
        return expanded or [query]

    def search_arxiv(self, query: str, max_results: int = 200,
                     start_date: Optional[datetime] = None,
                     end_date: Optional[datetime] = None) -> List[Dict]:
        try:
            client = arxiv.Client()
            date_filter = ""
            if start_date or end_date:
                start_str = start_date.strftime("%Y%m%d") if start_date else "19000101"
                end_str = end_date.strftime("%Y%m%d") if end_date else "20991231"
                date_filter = f" submittedDate:[{start_str} TO {end_str}]"
            full_query = f"({query}) AND {date_filter}" if date_filter else query
            search = arxiv.Search(
                query=full_query,
                max_results=min(max_results, 500),
                sort_by=arxiv.SortCriterion.SubmittedDate
            )
            papers = []
            for result in client.results(search):
                pub_date = result.published.replace(tzinfo=None) if result.published else None
                if start_date and pub_date and pub_date < start_date:
                    continue
                if end_date and pub_date and pub_date > end_date:
                    continue
                paper = {
                    'title': result.title,
                    'authors': ', '.join([str(a) for a in result.authors]),
                    'abstract': result.summary,
                    'pdf_url': result.pdf_url,
                    'publication_year': str(pub_date.year) if pub_date else '',
                    'full_date': pub_date.strftime("%Y-%m-%d") if pub_date else '',
                    'arxiv_id': result.entry_id.split('/')[-1],
                    'doi': result.doi,
                    'source': 'arxiv',
                    'journal': 'arXiv'
                }
                papers.append(paper)
            return papers
        except Exception:
            return []

    def search_crossref(self, query: str, max_results: int = 100,
                        start_date: Optional[datetime] = None,
                        end_date: Optional[datetime] = None) -> List[Dict]:
        keywords = re.findall(r'\b\w+\b', query)[:5]
        simple_query = ' '.join(keywords) or query
        url = "https://api.crossref.org/works"
        params = {'query': simple_query, 'rows': min(max_results, 100), 'sort': 'relevance'}
        
        filters = []
        if start_date:
            filters.append(f"from-created-date:{start_date.strftime('%Y-%m-%d')}")
        if end_date:
            filters.append(f"until-created-date:{end_date.strftime('%Y-%m-%d')}")
        if filters:
            params['filter'] = ','.join(filters)

        try:
            resp = requests.get(url, params=params, timeout=20, headers=self.headers)
            if resp.status_code != 200:
                return []
            items = resp.json().get('message', {}).get('items', [])
            papers = []
            for item in items:
                authors = ', '.join([f"{a.get('given','')} {a.get('family','')}".strip() for a in item.get('author', [])])
                parts = item.get('created', {}).get('date-parts', [[None]])[0]
                year = str(parts[0]) if parts and parts[0] else ''
                
                full_date_str = year
                if parts and len(parts) >= 1 and parts[0]:
                    full_date_str = "-".join([f"{p:02d}" for p in parts])

                papers.append({
                    'title': item.get('title', ['No title'])[0],
                    'authors': authors or 'Unknown',
                    'publication_year': year,
                    'full_date': full_date_str,
                    'doi': item.get('DOI'),
                    'journal': item.get('container-title', [''])[0] if item.get('container-title') else '',
                    'abstract': item.get('abstract', ''),
                    'source': 'crossref'
                })
            return papers
        except Exception:
            return []

    def search_semantic_scholar(self, query: str, max_results: int = 100,
                                start_date: Optional[datetime] = None,
                                end_date: Optional[datetime] = None) -> List[Dict]:
        keywords = re.findall(r'\b\w+\b', query)[:6]
        simple_query = ' '.join(keywords) or query
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            'query': simple_query,
            'limit': min(max_results, 100),
            'fields': 'title,authors,abstract,year,publicationDate,venue,externalIds,openAccessPdf'
        }
        try:
            resp = requests.get(url, params=params, timeout=20, headers=self.headers)
            if resp.status_code != 200:
                return []
            items = resp.json().get('data', [])
            papers = []
            for item in items:
                year = item.get('year')
                if start_date and year and year < start_date.year:
                    continue
                if end_date and year and year > end_date.year:
                    continue
                
                pub_date = item.get('publicationDate')
                
                papers.append({
                    'title': item.get('title', 'No title'),
                    'authors': ', '.join([a.get('name','') for a in item.get('authors', [])]),
                    'publication_year': str(year) if year else '',
                    'full_date': pub_date if pub_date else str(year) if year else '',
                    'doi': item.get('externalIds', {}).get('DOI'),
                    'journal': item.get('venue', ''),
                    'abstract': item.get('abstract', ''),
                    'pdf_url': item.get('openAccessPdf', {}).get('url') if item.get('openAccessPdf') else None,
                    'source': 'semantic_scholar'
                })
            return papers
        except Exception:
            return []

    def download_pdf(self, paper: Dict) -> Optional[str]:
        source = paper.get('source', 'generic')
        date_tag = str(paper.get('full_date') or paper.get('publication_year') or paper.get('year') or 'UnknownDate')
        
        dest_folder = self.proj_dir / "raw_scraped_files" / source
        dest_folder.mkdir(parents=True, exist_ok=True)
        
        safe_title = re.sub(r'[<>:"/\\|?*]', '_', paper.get('title', 'paper')[:50].strip())
        filename = f"[{date_tag}]_{source}_{safe_title}.pdf"
        file_path = dest_folder / filename
        
        pdf_url = paper.get('pdf_url')
        
        if not pdf_url and paper.get('doi'):
            try:
                unpaywall = f"https://api.unpaywall.org/v2/{paper['doi']}?email=researchflow@internal"
                res = requests.get(unpaywall, timeout=8, headers=self.headers)
                if res.status_code == 200:
                    pdf_url = res.json().get('best_oa_location', {}).get('url')
            except Exception:
                pass
                
        if not pdf_url:
            return None
            
        try:
            r = requests.get(pdf_url, headers=self.headers, stream=True, timeout=25)
            if r.status_code == 200 and 'pdf' in r.headers.get('content-type', '').lower():
                with open(file_path, 'wb') as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                return str(file_path.relative_to(self.proj_dir.parent.parent.parent))
        except Exception:
            return None
        return None

    def execute_collection(self, query: str, target_count: int = 100,
                           start_date: Optional[datetime] = None,
                           end_date: Optional[datetime] = None):
        self._ensure_tables()
        
        sub_queries = self.expand_boolean_query(query)
        sub_target = math.ceil(target_count / len(sub_queries)) if sub_queries else target_count

        logs = [
            "Establishing secure connection to APIs...",
            f"Expanded query into {len(sub_queries)} branches. Target per branch: {sub_target}"
        ]

        update_pipeline_state(self.project_id, {
            "current_step": 2,
            "steps": {
                "step_2": {
                    "status": "running",
                    "progress": {"found": 0, "target": target_count, "logs": logs, "collected_data": []}
                }
            }
        })

        collected: Dict[str, Dict] = {}
        seen: Set[str] = set()

        for sub_q in sub_queries:
            if len(collected) >= target_count:
                break
                
            collected_for_sub = 0
            logs.append(f"[SYSTEM] Searching branch: {sub_q[:40]}...")
            
            for fetcher in [self.search_arxiv, self.search_crossref, self.search_semantic_scholar]:
                if collected_for_sub >= sub_target or len(collected) >= target_count:
                    break
                    
                results = fetcher(sub_q, max_results=50, start_date=start_date, end_date=end_date)
                
                for p in results:
                    if collected_for_sub >= sub_target or len(collected) >= target_count:
                        break
                        
                    key = f"doi:{p['doi']}" if p.get('doi') else f"{p.get('title','').lower()}|{p.get('publication_year','')}"
                    
                    if key not in seen:
                        seen.add(key)
                        collected[key] = p
                        collected_for_sub += 1
                        
                        source_tag = p.get('source', 'api').upper()
                        logs.append(f"[{source_tag}] Found: {p.get('title', 'Untitled')[:60]}...")
                        
                        if len(logs) > 60:
                            logs = logs[-60:]
                        
                        current_data = []
                        for rec in collected.values():
                            current_data.append({
                                "Title": rec.get('title'),
                                "Abstract": rec.get('abstract'),
                                "Year": rec.get('publication_year'),
                                "DOI": rec.get('doi')
                            })
                        
                        update_pipeline_state(self.project_id, {
                            "steps": {
                                "step_2": {
                                    "status": "running",
                                    "progress": {
                                        "found": len(collected), 
                                        "target": target_count,
                                        "logs": logs,
                                        "collected_data": current_data
                                    }
                                }
                            }
                        })
                time.sleep(self.delay)

        papers = list(collected.values())[:target_count]
        logs.append("[SYSTEM] Scraping complete. Committing metadata to SQLite database...")
        
        with sqlite3.connect(DB_PATH) as conn:
            for idx, p in enumerate(papers, 1):
                paper_id = p.get('doi') or f"paper_{self.project_id}_{idx}_{int(time.time())}"
                conn.execute("""
                    INSERT OR REPLACE INTO papers 
                    (id, project_id, doi, title, authors, year, source, journal, abstract, pdf_path, metadata_json)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    paper_id, self.project_id, p.get('doi'), p.get('title', 'Untitled'),
                    p.get('authors', ''), int(p['publication_year']) if str(p.get('publication_year', '')).isdigit() else None,
                    p.get('source', 'unknown'), p.get('journal', ''), p.get('abstract', ''),
                    None, json.dumps(p)
                ))
            conn.commit()

        logs.append(f"[SUCCESS] Successfully saved {len(papers)} records.")
        
        final_data = [{"Title": p.get('title'), "Abstract": p.get('abstract'), "Year": p.get('publication_year'), "DOI": p.get('doi')} for p in papers]

        update_pipeline_state(self.project_id, {
            "steps": {
                "step_2": {
                    "status": "completed",
                    "completed_at": datetime.utcnow().isoformat(),
                    "progress": {"found": len(papers), "target": target_count, "logs": logs[-60:], "collected_data": final_data}
                }
            }
        })

    def execute_pdf_collection(self, target_count: int = 100):
        self._ensure_tables()
        
        with sqlite3.connect(DB_PATH) as conn:
            conn.row_factory = sqlite3.Row
            papers = conn.execute(
                "SELECT id, title, doi, source, year, metadata_json FROM papers WHERE project_id = ? AND (pdf_path IS NULL OR pdf_path = '')", 
                (self.project_id,)
            ).fetchall()
            
        papers_to_process = papers[:target_count]
        actual_target = len(papers_to_process)
        
        if actual_target == 0:
            update_pipeline_state(self.project_id, {
                "steps": {
                    "step_2_pdf": {
                        "status": "completed",
                        "progress": {"found": 0, "downloaded": 0, "target": 0, "logs": ["[SYSTEM] No missing PDFs found in database. Please run the Metadata extraction first!"]}
                    }
                }
            })
            return
            
        logs = [
            f"[SYSTEM] Found {len(papers)} records missing PDFs. Limiting scrape to {actual_target} records.",
            "Initializing secure download protocols..."
        ]
        
        update_pipeline_state(self.project_id, {
            "steps": {
                "step_2_pdf": {
                    "status": "running",
                    "progress": {"found": 0, "downloaded": 0, "target": actual_target, "logs": logs}
                }
            }
        })
        
        downloaded_count = 0
        
        for idx, row in enumerate(papers_to_process, 1):
            year_val = row["year"] if row["year"] else 'UnknownYear'
            paper_data = json.loads(row["metadata_json"]) if row["metadata_json"] else {}
            
            paper_data.update({
                "title": row["title"], 
                "doi": row["doi"], 
                "source": row["source"],
                "publication_year": str(year_val)
            })
            
            logs.append(f"[SYSTEM] Checking ({idx}/{actual_target}): {row['title'][:50]}...")
            if len(logs) > 60: logs = logs[-60:]
            
            update_pipeline_state(self.project_id, {
                "steps": {
                    "step_2_pdf": {
                        "status": "running",
                        "progress": {"found": idx, "downloaded": downloaded_count, "target": actual_target, "logs": logs}
                    }
                }
            })
            
            pdf_path = self.download_pdf(paper_data)
            
            if pdf_path:
                downloaded_count += 1
                logs.append(f"[SUCCESS] Downloaded Open-Access PDF for: {row['title'][:40]}...")
                
                with sqlite3.connect(DB_PATH) as conn:
                    conn.execute("UPDATE papers SET pdf_path = ? WHERE id = ?", (pdf_path, row["id"]))
                    conn.commit()
            else:
                logs.append(f"[ERROR] Failed to locate open-access PDF for: {row['title'][:40]}...")
                
            time.sleep(self.pdf_delay)
            
        logs.append(f"[SYSTEM] PDF Collection complete. Successfully acquired {downloaded_count} out of {actual_target} files.")
        
        update_pipeline_state(self.project_id, {
            "steps": {
                "step_2_pdf": {
                    "status": "completed",
                    "completed_at": datetime.utcnow().isoformat(),
                    "progress": {"found": actual_target, "downloaded": downloaded_count, "target": actual_target, "logs": logs[-60:]}
                }
            }
        })
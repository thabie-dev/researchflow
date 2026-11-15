import requests
import logging
from datetime import datetime, timedelta

class GitHubToolScout:
    def __init__(self, github_token: str = None):
        self.base_url = "https://api.github.com/search/repositories"
        self.headers = {"Accept": "application/vnd.github.v3+json"}
        if github_token:
            self.headers["Authorization"] = f"token {github_token}"
            
        self.stage_query_map = {
            "concept_note": '"research planning" OR "idea generation" OR "mind mapping"',
            "proposal": '"research proposal" OR "grant writing" OR "academic planning"',
            "introduction": '"academic writing" OR "writing assistant" OR "latex editor"',
            "literature_review": '"literature review" OR "citation mapping" OR "reference management" OR "paper recommender"',
            "methodology": '"experiment tracking" OR "research methodology" OR "reproducible research"',
            "data_collection": '"data collection" OR "web scraping" OR "dataset builder" OR "survey generator"',
            "results": '"data visualization" OR "statistical analysis" OR "chart builder"',
            "discussion": '"academic writing" OR "text summarization" OR "hypothesis testing"',
            "conclusion": '"bibliography generator" OR "citation formatting"',
            "references": '"citation manager" OR "bibtex" OR "zotero"'
        }

    def get_readme(self, full_name: str) -> str:
        """Fetches the raw Markdown README for a given repository."""
        url = f"https://api.github.com/repos/{full_name}/readme"
        
        # Request raw markdown instead of a JSON object with base64 encoded text
        headers = self.headers.copy()
        headers["Accept"] = "application/vnd.github.v3.raw"
        
        try:
            res = requests.get(url, headers=headers, timeout=5)
            if res.status_code == 200:
                # Truncate to ~5000 characters to ensure it fits easily into local LLM context windows
                return res.text
            return ""
        except requests.RequestException:
            return ""

    def find_new_tools(self, stage_id: str, days_back: int = 1000) -> list[dict]:
        date_threshold = (datetime.now() - timedelta(days=days_back)).strftime('%Y-%m-%d')
        query_string = self.stage_query_map.get(stage_id, '"academic research" OR "research tool"')
        
        query = f'{query_string} created:>{date_threshold}'
        
        params = {
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": 5 
        }
        
        try:
            response = requests.get(self.base_url, headers=self.headers, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            tools = []
            for repo in data.get("items", []):
                # Fetch the README using the owner/repo string
                readme_text = self.get_readme(repo["full_name"])
                
                tools.append({
                    "name": repo["name"],
                    "url": repo["html_url"],
                    "description": repo["description"] or "No description provided.",
                    "stars": repo["stargazers_count"],
                    "topics": repo.get("topics", []),
                    "created_at": repo["created_at"][:10],
                    "readme": readme_text
                })
            return tools
            
        except requests.RequestException as e:
            logging.error(f"GitHub API search failed for stage {stage_id}: {e}")
            return []
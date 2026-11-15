import requests
import logging
from app.services.expert_model import ExpertKnowledgePipeline

# Placeholder for your deployed API
EXTERNAL_NLP_API = "https://api.dummy-nlp.com/v1/extract-keywords"

class NLPService:
    @staticmethod
    def extract_terms(corpus: list[str]) -> list[dict]:
        if not corpus:
            return [{"term": "No terms found (empty corpus)", "strength": 0.0}]

        # 1. Attempt External API
        try:
            response = requests.post(
                EXTERNAL_NLP_API, 
                json={"documents": corpus}, 
                timeout=5 # Strict timeout so the UI doesn't hang if the server is dead
            )
            response.raise_for_status()
            api_data = response.json()
            
            # Assuming the API returns a list of dictionaries: [{"term": "foo", "strength": 5.2}, ...]
            if "retained_terms" in api_data:
                return api_data["retained_terms"]
                
        except requests.RequestException as e:
            logging.warning(f"External NLP API failed ({e}). Falling back to local ExpertKnowledgePipeline.")

        # 2. Local Fallback Execution
        try:
            pipeline = ExpertKnowledgePipeline()
            pipeline.load_corpus(corpus)
            
            num_terms = pipeline.extract_terms()
            if num_terms == 0:
                return [{"term": "No prominent n-grams found", "strength": 0.0}]
                
            pipeline.build_co_occurrence_network()
            _, retained_df = pipeline.analyze_network_and_prune()
            
            if retained_df.empty:
                return [{"term": "Network pruning yielded no terms", "strength": 0.0}]
                
            # Convert pandas DataFrame to the list of dicts the UI expects
            return retained_df[["term", "strength"]].to_dict(orient="records")
            
        except Exception as e:
            logging.error(f"Local fallback NLP pipeline failed: {e}")
            return [{"term": f"Extraction Error: {str(e)}", "strength": 0.0}]
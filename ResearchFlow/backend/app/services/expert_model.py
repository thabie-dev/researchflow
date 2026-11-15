import re
import numpy as np
import pandas as pd
import networkx as nx
from collections import Counter
from itertools import combinations
from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
from sklearn.feature_extraction.text import CountVectorizer
from scipy.interpolate import UnivariateSpline

class ExpertKnowledgePipeline:
    def __init__(self):
        # Hardcoded defaults matching the Jupyter Notebook
        self.min_freq = 3
        self.min_n = 2
        self.min_co_occurrence = 2
        self.stopwords = set(ENGLISH_STOP_WORDS)
        
        self.corpus = []         
        self.candidate_terms = [] 
        self.G = nx.Graph()   

    def load_corpus(self, document_list):
        self.corpus = [str(doc) for doc in document_list if doc and str(doc).strip()]
        return len(self.corpus)

    def extract_terms(self):
        phrase_counts = Counter()
        
        for text in self.corpus:
            text = text.lower()
            text = re.sub(r"[^a-z\s]", " ", text)
            words = text.split()
            
            # Generate 2 to 3-word n-grams
            for n in range(self.min_n, 4):  
                for i in range(len(words) - n + 1):
                    gram = words[i:i+n]
                    if any(w in self.stopwords for w in gram):
                        continue
                    phrase = " ".join(gram)
                    phrase_counts[phrase] += 1
                    
        # Apply notebook min_freq = 3 cutoff
        self.candidate_terms = [term for term, freq in phrase_counts.items() if freq >= self.min_freq]
        
        # Safety net: If data is too sparse, drop threshold to 1
        if not self.candidate_terms and phrase_counts:
            self.candidate_terms = [term for term, freq in phrase_counts.items() if freq >= 1]
            
        return len(self.candidate_terms)

    def build_co_occurrence_network(self):
        if not self.candidate_terms:
            return 0, 0
            
        try:
            vectorizer = CountVectorizer(vocabulary=self.candidate_terms, binary=True)
            X = vectorizer.fit_transform(self.corpus)
            
            self.G = nx.Graph()
            for term in self.candidate_terms:
                self.G.add_node(term)
                
            co_occurrence = Counter()
            for row in X.toarray():
                present_terms = [self.candidate_terms[i] for i, val in enumerate(row) if val > 0]
                for a, b in combinations(present_terms, 2):
                    co_occurrence[(a, b)] += 1
                    
            for (a, b), w in co_occurrence.items():
                if w >= self.min_co_occurrence:
                    self.G.add_edge(a, b, weight=w)
                    
            return self.G.number_of_nodes(), self.G.number_of_edges()
        except ValueError:
            return 0, 0

    def analyze_network_and_prune(self):
        # Fallback if network fails to connect
        if self.G.number_of_nodes() == 0 or self.G.number_of_edges() == 0: 
            if not self.candidate_terms:
                return pd.DataFrame(), pd.DataFrame()
            
            term_counts = Counter()
            for doc in self.corpus:
                doc_lower = doc.lower()
                for term in self.candidate_terms:
                    if term in doc_lower:
                        term_counts[term] += 1
            
            df = pd.DataFrame({'term': list(term_counts.keys()), 'strength': list(term_counts.values())})
            if not df.empty:
                df = df.sort_values(by='strength', ascending=False).reset_index(drop=True)
            return df, df

        # Centrality (Notebook Logic)
        strength = dict(self.G.degree(weight="weight"))
        betweenness = nx.betweenness_centrality(self.G, normalized=True)

        centrality_df = pd.DataFrame({
            "term": list(strength.keys()),
            "strength": list(strength.values()),
            "betweenness": [betweenness[t] for t in strength.keys()]
        })
        
        if centrality_df.empty: 
            return centrality_df, centrality_df
            
        # Term Ranking + UnivariateSpline Cutoff (Notebook Logic)
        term_strengths = centrality_df.sort_values("strength", ascending=False).reset_index(drop=True)
        term_strengths["rank"] = range(1, len(term_strengths) + 1)
        
        if len(term_strengths) > 3:
            try:
                y = term_strengths["strength"].values
                x = term_strengths["rank"].values
                
                spline = UnivariateSpline(x, y, k=3)
                y_smooth = spline(x)
                
                # Approximate elbow as max curvature
                curvature = np.gradient(np.gradient(y_smooth))
                cp_index = np.argmax(curvature)
                cutoff_strength = y[cp_index]
                
                term_strengths["retained"] = term_strengths["strength"] >= cutoff_strength
            except Exception as e:
                print(f"Spline calculation failed, falling back to 50th percentile: {e}")
                term_strengths["retained"] = term_strengths["strength"] >= term_strengths["strength"].quantile(0.5)
        else:
            term_strengths["retained"] = True

        retained_terms = term_strengths[term_strengths["retained"]].copy()
            
        return term_strengths, retained_terms
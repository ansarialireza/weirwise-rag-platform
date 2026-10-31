"""Weirwise Copilot Knowledge Retrieval Service.

Loads official product documentation chunks and performs isolated similarity matching.
"""

import re
from pathlib import Path
from typing import NamedTuple

KNOWLEDGE_FILE_PATH = Path(__file__).resolve().parent / "knowledge" / "official_product_knowledge.md"


STOP_WORDS = {
    "the",
    "and",
    "what",
    "which",
    "who",
    "whom",
    "this",
    "that",
    "these",
    "those",
    "am",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "having",
    "do",
    "does",
    "did",
    "doing",
    "would",
    "should",
    "could",
    "ought",
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "their",
    "our",
    "your",
    "for",
    "with",
    "about",
    "against",
    "between",
    "into",
    "through",
    "during",
    "before",
    "after",
    "above",
    "below",
    "to",
    "from",
    "up",
    "down",
    "in",
    "out",
    "on",
    "off",
    "over",
    "under",
    "again",
    "further",
    "then",
    "once",
    "here",
    "there",
    "when",
    "where",
    "why",
    "how",
    "all",
    "any",
    "both",
    "each",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "no",
    "nor",
    "not",
    "only",
    "own",
    "same",
    "so",
    "than",
    "too",
    "very",
    "can",
    "will",
    "just",
}


class KnowledgeChunk(NamedTuple):
    title: str
    content: str
    keywords: set[str]


class CopilotKnowledgeStore:
    def __init__(self, knowledge_path: Path | None = None):
        self.knowledge_path = knowledge_path or KNOWLEDGE_FILE_PATH
        self.chunks: list[KnowledgeChunk] = []
        self._load_knowledge()

    def _load_knowledge(self) -> None:
        if not self.knowledge_path.exists():
            return

        with open(self.knowledge_path, "r", encoding="utf-8") as f:
            text = f.read()

        # Split markdown by sections (## )
        sections = re.split(r"\n(?=##\s)", text)
        for section in sections:
            lines = section.strip().split("\n")
            if not lines or not lines[0]:
                continue
            title = lines[0].replace("#", "").strip()
            body = "\n".join(lines[1:]).strip()
            if not body:
                continue

            raw_words = set(re.findall(r"\b[a-zA-Z0-9_\-\.]{3,}\b", (title + " " + body).lower()))
            meaningful_words = raw_words - STOP_WORDS
            self.chunks.append(KnowledgeChunk(title=title, content=body, keywords=meaningful_words))

    def search(self, query: str, top_k: int = 3, score_threshold: float = 0.25) -> list[dict]:
        """Search curated official knowledge using keyword matching excluding stopwords."""
        raw_words = set(re.findall(r"\b[a-zA-Z0-9_\-\.]{3,}\b", query.lower()))
        q_words = raw_words - STOP_WORDS
        if not q_words or not self.chunks:
            return []

        scored_results: list[tuple[float, KnowledgeChunk]] = []

        for chunk in self.chunks:
            intersection = q_words.intersection(chunk.keywords)
            if not intersection:
                continue

            score = len(intersection) / len(q_words)
            if score >= score_threshold:
                scored_results.append((score, chunk))

        scored_results.sort(key=lambda x: x[0], reverse=True)

        results = []
        for rank, (score, chunk) in enumerate(scored_results[:top_k], start=1):
            results.append(
                {
                    "chunk_id": f"copilot-kb-{rank}",
                    "title": chunk.title,
                    "content": chunk.content,
                    "similarity_score": round(min(score, 1.0), 3),
                    "rank": rank,
                }
            )
        return results


copilot_knowledge_store = CopilotKnowledgeStore()

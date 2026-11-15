"""Download BERTopic's embedding model once, then verify offline loading."""

from sentence_transformers import SentenceTransformer


MODEL_NAME = "all-MiniLM-L6-v2"


def cache_model() -> None:
    try:
        SentenceTransformer(MODEL_NAME, local_files_only=True)
        print(f"BERTopic model is already cached: {MODEL_NAME}")
        return
    except OSError:
        print(f"Downloading BERTopic model: {MODEL_NAME}")

    SentenceTransformer(MODEL_NAME)
    SentenceTransformer(MODEL_NAME, local_files_only=True)
    print(f"BERTopic model cached successfully: {MODEL_NAME}")


if __name__ == "__main__":
    cache_model()

from functools import lru_cache


@lru_cache
def resolve_device(preference: str = "auto") -> str:
    """`preference` is "auto" | "cuda" | "mps" | "cpu" (from DEVICE in .env).
    "auto" picks the best available accelerator: CUDA, then Apple Silicon
    MPS, falling back to CPU. An explicit preference is returned as-is."""
    if preference and preference != "auto":
        return preference
    try:
        import torch
    except ImportError:
        return "cpu"
    if torch.cuda.is_available():
        return "cuda"
    if getattr(torch.backends, "mps", None) is not None and torch.backends.mps.is_available():
        return "mps"
    return "cpu"

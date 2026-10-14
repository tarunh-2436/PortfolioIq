from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class OptimizationRequest(BaseModel):
    tickers: List[str] = Field(..., min_length=2, max_length=50)
    # Current portfolio weights (fractions) used to compare against the optimum
    current_weights: Optional[Dict[str, float]] = None
    include_ai: bool = True

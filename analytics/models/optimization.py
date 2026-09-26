from pydantic import BaseModel, Field
from typing import List


class OptimizationRequest(BaseModel):
    tickers: List[str] = Field(..., min_length=2)


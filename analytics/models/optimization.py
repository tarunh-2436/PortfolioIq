from pydantic import BaseModel
from typing import List


class OptimizationRequest(BaseModel):

    tickers: List[str]

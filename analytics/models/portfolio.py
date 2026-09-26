from pydantic import BaseModel, Field
from typing import List


class Holding(BaseModel):
    ticker: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0, le=1)


class PortfolioRequest(BaseModel):
    portfolio: List[Holding] = Field(..., min_length=1)


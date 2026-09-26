from pydantic import BaseModel, Field
from typing import List, Optional


class ScenarioHolding(BaseModel):
    ticker: str = Field(..., min_length=1)
    weight: float = Field(..., gt=0, le=1)
    shock: Optional[float] = None


class ScenarioRequest(BaseModel):
    portfolio: List[ScenarioHolding] = Field(..., min_length=1)
    portfolio_value: float = Field(1000000.0, gt=0)
    scenario: Optional[str] = None


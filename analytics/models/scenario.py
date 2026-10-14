from pydantic import BaseModel, Field
from typing import Dict, List, Optional


class ScenarioHolding(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=20)
    weight: float = Field(..., gt=0, le=1)


class ScenarioRequest(BaseModel):
    portfolio: List[ScenarioHolding] = Field(..., min_length=1, max_length=100)
    portfolio_value: float = Field(1000000.0, gt=0, le=1e12)
    scenario: Optional[str] = None
    # Custom shocks per domain as fractions, e.g. {"Technology": -0.2}
    domain_shocks: Optional[Dict[str, float]] = None


class ClassifyRequest(BaseModel):
    portfolio: List[ScenarioHolding] = Field(..., min_length=1, max_length=100)

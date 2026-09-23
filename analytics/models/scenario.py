from pydantic import BaseModel
from typing import List, Optional


class ScenarioHolding(BaseModel):

    ticker: str
    weight: float
    shock: Optional[float] = None


class ScenarioRequest(BaseModel):

    portfolio: List[ScenarioHolding]

    portfolio_value: float = 1000000

    scenario: Optional[str] = None

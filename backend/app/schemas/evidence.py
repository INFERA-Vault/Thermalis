from typing import List, Optional

from pydantic import BaseModel, Field


class EvidenceSignal(BaseModel):
    key: str
    label: str
    score: Optional[float] = Field(default=None, description="Signal contribution on a 0-100 scale")
    weight: float
    available: bool
    explanation: str


class EvidenceAssessmentResponse(BaseModel):
    method_version: str
    event_id: int
    evidence_score: float = Field(description="Weighted operational evidence score, not a probability")
    observed_signal_strength: float
    data_coverage: float = Field(description="Percentage of configured signal weight supported by available data")
    priority: str
    interpretation: str
    recommendation: str
    signals: List[EvidenceSignal]
    top_evidence: List[str]
    missing_signals: List[str]
    reference_model_used: bool
    caution: str

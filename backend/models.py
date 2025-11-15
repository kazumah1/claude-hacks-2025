"""
Pydantic models matching the TypeScript types in the frontend.
"""

from pydantic import BaseModel
from typing import Optional, List, Dict


class FactSourceModel(BaseModel):
    """Represents a fact-checking source"""
    title: str
    url: str
    snippet: str


class SegmentModel(BaseModel):
    """Represents a transcript segment"""
    id: str
    sessionId: str
    speaker: str
    start: float
    end: float
    text: str


class ClaimModel(BaseModel):
    """Represents a claim extracted from a segment"""
    id: str
    sessionId: str
    segmentId: str
    speaker: str
    start: float
    end: float
    text: str
    fallacy: str  # "none", "strawman", "ad_hominem", etc.
    needsFactCheck: bool
    verdict: str  # "not_checked", "supported", "disputed", "likely_false", "uncertain"
    confidence: Optional[float] = None
    reasoning: Optional[str] = None
    sources: Optional[List[FactSourceModel]] = None


class LiveSessionState(BaseModel):
    """State for a live debate session"""
    sessionId: str
    startedAt: float
    speakers: Dict[str, str]
    segments: List[SegmentModel] = []
    claims: List[ClaimModel] = []


class ClaudeClaimInput(BaseModel):
    """Claim payload coming from Claude or another extractor"""
    id: Optional[str] = None
    segmentId: Optional[str] = None
    text: str
    speaker: Optional[str] = None
    start: Optional[float] = None
    end: Optional[float] = None
    fallacy: Optional[str] = "none"
    needsFactCheck: Optional[bool] = True


class BatchFactCheckRequest(BaseModel):
    """Request payload for batch fact-checking claims"""
    sessionId: Optional[str] = None
    claims: List[ClaudeClaimInput]


# In-memory session storage
SESSIONS: Dict[str, LiveSessionState] = {}

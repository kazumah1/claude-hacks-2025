import fastapi
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
import time

from models import (
    SegmentModel,
    ClaimModel,
    LiveSessionState,
    FactSourceModel,
    SESSIONS
)
from factiverse_client import fact_check_claim, detect_claims

app = fastapi.FastAPI()

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/live/start")
async def start_live_session(request: Optional[dict] = None):
    """
    Start a new live debate session.
    
    Request body (optional):
    {
        "speakers": {
            "spk_0": "Speaker A",
            "spk_1": "Speaker B"
        }
    }
    """
    session_id = f"live_{int(time.time() * 1000)}"
    
    default_speakers = {
        "spk_0": "Speaker A",
        "spk_1": "Speaker B"
    }
    
    if request and "speakers" in request:
        session_speakers = request["speakers"]
    else:
        session_speakers = default_speakers
    
    session = LiveSessionState(
        sessionId=session_id,
        startedAt=time.time(),
        speakers=session_speakers,
        segments=[],
        claims=[]
    )
    
    SESSIONS[session_id] = session
    
    return {
        "sessionId": session_id,
        "speakers": session_speakers
    }


@app.post("/api/fact-check")
async def fact_check_endpoint(request: dict):
    """
    Fact-check a single claim using Factiverse API.
    
    Request body:
    {
        "claimText": "The claim to fact-check"
    }
    
    Response:
    {
        "verdict": "supported" | "disputed" | "likely_false" | "uncertain",
        "confidence": 0.0-1.0,
        "reasoning": "Explanation...",
        "sources": [
            {
                "title": "Source title",
                "url": "https://...",
                "snippet": "Relevant excerpt..."
            }
        ]
    }
    """
    claim_text = request.get("claimText")
    if not claim_text:
        raise HTTPException(status_code=400, detail="claimText is required")
    
    result = await fact_check_claim(claim_text)
    
    return {
        "verdict": result.verdict,
        "confidence": result.confidence,
        "reasoning": result.reasoning,
        "sources": [
            {
                "title": source.title,
                "url": source.url,
                "snippet": source.snippet
            }
            for source in result.sources
        ]
    }


@app.post("/api/analyze-segment")
async def analyze_segment(segment: SegmentModel):
    """
    Analyze a transcript segment to extract claims and fact-check them.
    
    This endpoint:
    1. Accepts a segment (from STT)
    2. Calls Claude API to extract claims and detect fallacies (TODO: implement Claude integration)
    3. For each claim needing fact-check, calls Factiverse API
    4. Returns enriched claims with verdicts and sources
    
    Request body:
    {
        "id": "seg_1",
        "sessionId": "live_abc123",
        "speaker": "spk_0",
        "start": 12.3,
        "end": 15.8,
        "text": "I think Cuomo wants to abolish all policing."
    }
    
    Response:
    [
        {
            "id": "claim_1",
            "sessionId": "live_abc123",
            "segmentId": "seg_1",
            "speaker": "spk_0",
            "start": 12.3,
            "end": 15.8,
            "text": "Cuomo wants to abolish all policing",
            "fallacy": "strawman",
            "needsFactCheck": true,
            "verdict": "likely_false",
            "confidence": 0.85,
            "reasoning": "This claim misrepresents the actual policy position...",
            "sources": [...]
        }
    ]
    """
    # Ensure session exists
    if segment.sessionId not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = SESSIONS[segment.sessionId]
    
    # Try to extract claims directly from Factiverse. Fall back to the whole segment.
    detected_claims = await detect_claims(segment.text)
    if detected_claims:
        claims_to_check = [
            {
                "text": claim["text"],
                "fallacy": "none",
                "detectionScore": claim.get("score")
            }
            for claim in detected_claims
        ]
    else:
        claims_to_check = [
            {
                "text": segment.text,
                "fallacy": "none"
            }
        ]
    
    enriched_claims = []
    
    for claim_data in claims_to_check:
        claim_id = f"claim_{uuid.uuid4().hex[:8]}"
        claim_text = claim_data["text"]
        fallacy = claim_data["fallacy"]
        
        # Determine if this claim needs fact-checking
        # In production, Claude will mark this
        needs_fact_check = True  # For now, fact-check everything
        
        verdict = "not_checked"
        confidence = None
        reasoning = None
        sources = None
        
        # Fact-check if needed
        if needs_fact_check:
            fact_check_result = await fact_check_claim(claim_text)
            verdict = fact_check_result.verdict
            confidence = fact_check_result.confidence
            reasoning = fact_check_result.reasoning
            sources = [
                FactSourceModel(
                    title=source.title,
                    url=source.url,
                    snippet=source.snippet
                )
                for source in fact_check_result.sources
            ]
        
        claim = ClaimModel(
            id=claim_id,
            sessionId=segment.sessionId,
            segmentId=segment.id,
            speaker=segment.speaker,
            start=segment.start,
            end=segment.end,
            text=claim_text,
            fallacy=fallacy,
            needsFactCheck=needs_fact_check,
            verdict=verdict,
            confidence=confidence,
            reasoning=reasoning,
            sources=sources
        )
        
        enriched_claims.append(claim)
    
    # Update session state
    session.segments.append(segment)
    session.claims.extend(enriched_claims)
    
    # Return claims as JSON
    return [
        {
            "id": claim.id,
            "sessionId": claim.sessionId,
            "segmentId": claim.segmentId,
            "speaker": claim.speaker,
            "start": claim.start,
            "end": claim.end,
            "text": claim.text,
            "fallacy": claim.fallacy,
            "needsFactCheck": claim.needsFactCheck,
            "verdict": claim.verdict,
            "confidence": claim.confidence,
            "reasoning": claim.reasoning,
            "sources": [
                {
                    "title": source.title,
                    "url": source.url,
                    "snippet": source.snippet
                }
                for source in (claim.sources or [])
            ]
        }
        for claim in enriched_claims
    ]


@app.get("/api/live/state")
async def get_live_state(sessionId: str):
    """
    Get the current state of a live session.
    
    Query params:
    - sessionId: The session ID
    
    Response:
    {
        "sessionId": "live_abc123",
        "startedAt": 1710000000.0,
        "speakers": { "spk_0": "Speaker A", "spk_1": "Speaker B" },
        "segments": [...],
        "claims": [...]
    }
    """
    if sessionId not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    
    session = SESSIONS[sessionId]
    
    return {
        "sessionId": session.sessionId,
        "startedAt": session.startedAt,
        "speakers": session.speakers,
        "segments": [
            {
                "id": seg.id,
                "sessionId": seg.sessionId,
                "speaker": seg.speaker,
                "start": seg.start,
                "end": seg.end,
                "text": seg.text
            }
            for seg in session.segments
        ],
        "claims": [
            {
                "id": claim.id,
                "sessionId": claim.sessionId,
                "segmentId": claim.segmentId,
                "speaker": claim.speaker,
                "start": claim.start,
                "end": claim.end,
                "text": claim.text,
                "fallacy": claim.fallacy,
                "needsFactCheck": claim.needsFactCheck,
                "verdict": claim.verdict,
                "confidence": claim.confidence,
                "reasoning": claim.reasoning,
                "sources": [
                    {
                        "title": source.title,
                        "url": source.url,
                        "snippet": source.snippet
                    }
                    for source in (claim.sources or [])
                ]
            }
            for claim in session.claims
        ]
    }

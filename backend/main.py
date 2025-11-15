import fastapi
from fastapi import HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import uuid
import time
import asyncio

from models import (
    SegmentModel,
    ClaimModel,
    LiveSessionState,
    FactSourceModel,
    BatchFactCheckRequest,
    FallacyInsightModel,
    FallacyAnalysisRequest,
    SegmentChunkRequest,
    SESSIONS
)
from factiverse_client import fact_check_claim, detect_claims
from claude_client import extract_claim_from_text, analyze_claim_with_context

app = fastapi.FastAPI()

# CORS middleware for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _summarize_reasoning(text: Optional[str], fallback_count: int = 0) -> Optional[str]:
    """Return a short summary suitable for UI display."""
    if text:
        summary = text.strip()
        if not summary:
            summary = None
    else:
        summary = None
    if summary:
        max_len = 240
        if len(summary) > max_len:
            summary = summary[: max_len - 1].rstrip() + "…"
        return summary
    if fallback_count:
        return f"Factiverse returned {fallback_count} source(s) for this claim."
    return None


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
    requested_session_id = request.get("sessionId") if request else None
    session_id = requested_session_id or f"live_{int(time.time() * 1000)}"
    
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


@app.post("/api/claims/fact-check")
async def fact_check_claude_claims(request: BatchFactCheckRequest):
    """
    Accept a list of claims (e.g., from Claude) and return verdicts + summaries + sources.
    """
    if not request.claims:
        raise HTTPException(status_code=400, detail="claims list cannot be empty")

    session_id = request.sessionId or f"adhoc_{int(time.time() * 1000)}"

    async def _evaluate_claim(idx: int, claim_input):
        claim_id = claim_input.id or f"claim_{uuid.uuid4().hex[:8]}"
        segment_id = claim_input.segmentId or claim_id
        fallacy = (claim_input.fallacy or "none").lower()
        needs_fact_check = (
            True if claim_input.needsFactCheck is None else bool(claim_input.needsFactCheck)
        )
        text = claim_input.text.strip()
        if not text:
            needs_fact_check = False

        start = float(claim_input.start) if claim_input.start is not None else 0.0
        end = float(claim_input.end) if claim_input.end is not None else start

        verdict = "not_checked"
        confidence = None
        summary = None
        sources: Optional[List[FactSourceModel]] = None

        if needs_fact_check:
            fact_check_result = await fact_check_claim(text)
            verdict = fact_check_result.verdict
            confidence = fact_check_result.confidence
            sources = [
                FactSourceModel(
                    title=source.title,
                    url=source.url,
                    snippet=source.snippet
                )
                for source in fact_check_result.sources
            ]
            summary = _summarize_reasoning(fact_check_result.reasoning, len(sources))
        else:
            summary = "Claim skipped (no fact-check needed)"

        claim_model = ClaimModel(
            id=claim_id,
            sessionId=session_id,
            segmentId=segment_id,
            speaker=claim_input.speaker or "unknown",
            start=start,
            end=end,
            text=text,
            fallacy=fallacy or "none",
            needsFactCheck=needs_fact_check,
            verdict=verdict,
            confidence=confidence,
            reasoning=summary,
            sources=sources
        )
        return claim_model

    tasks = [
        _evaluate_claim(idx, claim)
        for idx, claim in enumerate(request.claims)
    ]
    results = await asyncio.gather(*tasks)

    if request.sessionId and request.sessionId in SESSIONS:
        session = SESSIONS[request.sessionId]
        session.claims.extend(results)

    return {
        "sessionId": session_id,
        "results": [
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
            for claim in results
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

    # Use Claude API to extract a single factual claim from the segment
    # Rate limited to 1 claim every 15 seconds per session
    print(f"Extracting claim from segment: {segment.text[:100]}...")
    claude_claim = await extract_claim_from_text(
        segment.text,
        segment.speaker,
        segment.sessionId  # Pass session ID for rate limiting
    )

    enriched_claims = []

    # If Claude extracted a claim, fact-check it with Factiverse
    if claude_claim:
        claim_id = f"claim_{uuid.uuid4().hex[:8]}"
        claim_text = claude_claim["text"]
        fallacy = claude_claim.get("fallacy", "none")
        needs_fact_check = claude_claim.get("needsFactCheck", True)

        verdict = "not_checked"
        confidence = None
        reasoning = None
        sources = None

        # Fact-check with Factiverse if needed
        if needs_fact_check:
            print(f"Fact-checking claim: {claim_text}")
            fact_check_result = await fact_check_claim(claim_text)
            verdict = fact_check_result.verdict
            confidence = fact_check_result.confidence
            reasoning = _summarize_reasoning(
                fact_check_result.reasoning,
                len(fact_check_result.sources)
            )
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
    else:
        print(f"No factual claim found in segment: {segment.text}")
    
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


@app.post("/api/fallacies/analyze")
async def analyze_fallacies(request: FallacyAnalysisRequest):
    """
    Analyze recent transcript segments for logical fallacies using Claude.
    """
    if not request.segments:
        raise HTTPException(status_code=400, detail="segments list cannot be empty")

    session_id = request.sessionId or f"adhoc_{int(time.time() * 1000)}"
    results: List[FallacyInsightModel] = []

    for segment in request.segments:
        try:
            analysis = await analyze_claim_with_context(
                segment.text,
                segment.speaker,
                detect_fallacies=True
            )
        except Exception as exc:
            print(f"Error analyzing fallacies for segment {segment.id}: {exc}")
            continue

        if not analysis:
            continue

        fallacy = (analysis.get("fallacy") or "none").lower()
        if fallacy == "none":
            continue

        insight = FallacyInsightModel(
            id=f"fallacy_{uuid.uuid4().hex[:8]}",
            sessionId=session_id,
            segmentId=segment.id,
            speaker=segment.speaker,
            start=segment.start,
            end=segment.end,
            text=analysis.get("text") or segment.text,
            fallacy=fallacy,
            reasoning=analysis.get("reasoning")
        )
        results.append(insight)

    return {
        "sessionId": session_id,
        "results": [
            {
                "id": item.id,
                "sessionId": item.sessionId,
                "segmentId": item.segmentId,
                "speaker": item.speaker,
                "start": item.start,
                "end": item.end,
                "text": item.text,
                "fallacy": item.fallacy,
                "reasoning": item.reasoning,
            }
            for item in results
        ]
    }


@app.post("/api/analyze-chunk")
async def analyze_chunk(request: SegmentChunkRequest):
    """Analyze multiple segments together for a single claim."""

    if not request.segments:
        raise HTTPException(status_code=400, detail="segments list cannot be empty")

    if request.sessionId not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")

    session = SESSIONS[request.sessionId]
    existing_ids = {segment.id for segment in session.segments}
    sorted_segments = sorted(request.segments, key=lambda seg: seg.start)

    # Ensure session knows about these segments
    for seg in sorted_segments:
        if seg.id not in existing_ids:
            session.segments.append(seg)
            existing_ids.add(seg.id)

    lines = []
    for seg in sorted_segments:
        speaker_label = session.speakers.get(seg.speaker, seg.speaker)
        lines.append(f"{speaker_label}: {seg.text}")
    chunk_text = "\n".join(lines)

    print(f"Extracting chunk claim for session {request.sessionId}: {chunk_text[:120]}...")
    claude_claim = await extract_claim_from_text(
        chunk_text,
        speaker=None,
        session_id=request.sessionId
    )

    enriched_claims: List[ClaimModel] = []

    if claude_claim:
        claim_id = f"claim_{uuid.uuid4().hex[:8]}"
        claim_text = claude_claim["text"]
        fallacy = claude_claim.get("fallacy", "none")
        needs_fact_check = claude_claim.get("needsFactCheck", True)

        # Attempt to determine which speaker made the claim
        matched_segment = None
        lowered = claim_text.lower()
        for seg in sorted_segments:
            if lowered and lowered in seg.text.lower():
                matched_segment = seg
                break
        if not matched_segment:
            matched_segment = sorted_segments[-1]

        verdict = "not_checked"
        confidence = None
        reasoning = None
        sources = None

        if needs_fact_check:
            print(f"Fact-checking chunk claim: {claim_text}")
            fact_check_result = await fact_check_claim(claim_text)
            verdict = fact_check_result.verdict
            confidence = fact_check_result.confidence
            reasoning = _summarize_reasoning(
                fact_check_result.reasoning,
                len(fact_check_result.sources)
            )
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
            sessionId=request.sessionId,
            segmentId=matched_segment.id,
            speaker=matched_segment.speaker,
            start=matched_segment.start,
            end=matched_segment.end,
            text=claim_text,
            fallacy=fallacy,
            needsFactCheck=needs_fact_check,
            verdict=verdict,
            confidence=confidence,
            reasoning=reasoning,
            sources=sources
        )

        session.claims.append(claim)
        enriched_claims.append(claim)

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

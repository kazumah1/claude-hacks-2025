"""
Factiverse API Client for Live Fact Checking

This module provides functions to interact with the Factiverse API
for fact-checking claims extracted from debate segments.
"""

import os
import httpx
from typing import Optional, Dict, List, Any
from pydantic import BaseModel


# Factiverse API Configuration
FACTIVERSE_API_BASE = "https://api.factiverse.ai"
FACTIVERSE_API_KEY = os.getenv(
    "FACTIVERSE_API_KEY",
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IldHaG9KLXExbllVbXNJQXRubktJMyJ9.eyJ1c2VyX2VtYWlsIjoiYWtzaGF5LnNoaXZrdW1hckBiZXJrZWxleS5lZHUiLCJ1c2VyX25ldyI6dHJ1ZSwic3RyaXBlX2N1c3RvbWVyX2lkIjoiY3VzX1RRTHRJWWxMVFN2eERPIiwic3RyaXBlX3BhaWRfdXNlciI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vYXV0aC5mYWN0aXZlcnNlLmFpLyIsInN1YiI6Imdvb2dsZS1vYXV0aDJ8MTA2NTg1MDk5NTIyODAwNTY4MTk1IiwiYXVkIjpbImh0dHBzOi8vZmFjdGl2ZXJzZS9hcGkiLCJodHRwczovL2ZhY3RpdmVyc2UtYXV0aC5ldS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzYzMTU4MTY4LCJleHAiOjE3NjU3NTAxNjgsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwgcG9zdDpmZWVkYmFjayBwb3N0OmJpYXNfZGV0ZWN0aW9uIHBvc3Q6Y2xhaW1fZGV0ZWN0aW9uIHBvc3Q6c2VhcmNoIHBvc3Q6ZmFjdF9jaGVjayBwb3N0OnN0YW5jZV9kZXRlY3Rpb24gcG9zdDpjbGFpbV9zZWFyY2ggb2ZmbGluZV9hY2Nlc3MiLCJhenAiOiJhMmVacFF2NmpiSHJMRUFBQ0xibHAyNW1ydFZSaUxpRSJ9.KnODkIcaOuf__9MEpmZGgUAxuPLuxoSbQgxobf25X_DdhxgE5ZU8OV9W1slaxM7RxEO0n-pCPsNqXZKBKDtHLOnxZS0RPkQJ1dVx6LhlWsKr6HkkpdWhKiBDLNViXHYobeHOOULHGi3SSnVrfxdqEZPuy2spTXxiBA-vEeew0xwv88z9pAA66fcwhN_sYm50i8wKBDO69t3aNJIzhzRPLDKU87dTh_JG4uHc4IoVrOfxOMLzASIter2p90ETHtmoBu8SsvJSZm3wlf92Zb5JRau62OU8ui9a9k8u9gjwrO-EKfNh9x6chMYSkzqdoqcoKlfCMT9kv30iKxxmI2haAQ"
)


class FactSource(BaseModel):
    """Represents a fact-checking source"""
    title: str
    url: str
    snippet: str


class FactCheckResult(BaseModel):
    """Result from Factiverse fact-checking API"""
    verdict: str  # "supported", "disputed", "likely_false", "uncertain", "not_checked"
    confidence: Optional[float] = None  # 0.0-1.0
    reasoning: Optional[str] = None
    sources: List[FactSource] = []


async def fact_check_claim(claim_text: str) -> FactCheckResult:
    """
    Fact-check a single claim using Factiverse API.
    
    This function uses the `/v1/stance_detection` endpoint which:
    - Analyzes the claim and finds supporting/refuting evidence
    - Returns stance detection with evidence sources
    
    Args:
        claim_text: The claim text to fact-check
        
    Returns:
        FactCheckResult with verdict, confidence, reasoning, and sources
    """
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "claim": claim_text,
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:  # Increased timeout for stance detection
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/stance_detection",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            
            # Parse Factiverse response and map to our format
            return _parse_stance_detection_response(data, claim_text)
            
    except httpx.HTTPStatusError as e:
        print(f"Factiverse API error: {e.response.status_code} - {e.response.text}")
        # Return uncertain verdict on API error
        return FactCheckResult(
            verdict="uncertain",
            reasoning=f"Fact-check API error: {e.response.status_code}"
        )
    except Exception as e:
        print(f"Error calling Factiverse API: {str(e)}")
        import traceback
        traceback.print_exc()
        return FactCheckResult(
            verdict="uncertain",
            reasoning=f"Error during fact-check: {str(e)}"
        )


def _parse_stance_detection_response(data: Dict[str, Any], original_claim: str) -> FactCheckResult:
    """
    Parse Factiverse stance_detection API response and convert to our FactCheckResult format.
    
    The Factiverse stance_detection API returns:
    - evidence: list of evidence items with labelDescription ("SUPPORTS", "REFUTES", "MIXED", "NOT_ENOUGH_INFO")
    - finalLabelDescription: overall verdict
    - finalScore: confidence score (0-1, where higher = more refuting for REFUTES)
    - summary: array of summary strings
    - Each evidence item has: title, url, snippet, labelDescription, stanceScore
    
    We map this to our verdict system:
    - "REFUTES" -> "likely_false" (if strong) or "disputed" (if moderate)
    - "SUPPORTS" -> "supported"
    - "MIXED" -> "disputed"
    - "NOT_ENOUGH_INFO" -> "uncertain"
    """
    # Extract the main data structure (could be nested in 'data' array or at top level)
    main_data = data
    
    # Check if data is nested in 'data' array
    if "data" in data and isinstance(data["data"], list) and len(data["data"]) > 0:
        main_data = data["data"][0]
    
    # Get final verdict and score (Factiverse sometimes omits/sets None)
    # Try both top-level and nested locations
    final_label_raw = main_data.get("finalLabelDescription")
    if not final_label_raw and "finalLabelDescription" in data:
        final_label_raw = data.get("finalLabelDescription")
    
    final_label = str(final_label_raw).upper() if final_label_raw else ""
    
    final_score = main_data.get("finalScore")
    if final_score is None and "finalScore" in data:
        final_score = data.get("finalScore")
    if final_score is None:
        final_score = 0.5
    
    # Map Factiverse labels to our verdict system
    if final_label == "REFUTES":
        # Use score to determine if it's "likely_false" (high confidence) or "disputed"
        # Score > 0.65 indicates strong refutation
        if final_score > 0.65:
            verdict = "likely_false"
            confidence = final_score
        else:
            verdict = "disputed"
            confidence = final_score
    elif final_label == "SUPPORTS":
        verdict = "supported"
        confidence = final_score
    elif final_label == "MIXED":
        verdict = "disputed"
        confidence = 0.5  # Mixed evidence = moderate confidence
    elif final_label == "NOT_ENOUGH_INFO" or final_label == "":
        # No information available from Factiverse
        verdict = "uncertain"
        confidence = None
    else:
        verdict = "uncertain"
        confidence = None
    
    # Extract reasoning from summary
    summary_list = main_data.get("summary")
    if summary_list is None and "summary" in data:
        summary_list = data.get("summary")
    if summary_list is None:
        summary_list = []
    
    if summary_list:
        # Use the first summary as reasoning, or combine them
        reasoning = summary_list[0] if isinstance(summary_list[0], str) else str(summary_list[0])
        if len(summary_list) > 1:
            reasoning += f" ({len(summary_list)} additional points found)"
    else:
        # If no summary and no label, provide a helpful message
        if final_label == "" or final_label == "NOT_ENOUGH_INFO":
            reasoning = "No information found in fact-checking databases for this claim."
        else:
            reasoning = None
    
    # Extract sources from evidence
    evidence_list = main_data.get("evidence")
    if evidence_list is None and "evidence" in data:
        evidence_list = data.get("evidence")
    if evidence_list is None:
        evidence_list = []
    
    sources = []
    
    for evidence in evidence_list:
        # Only include sources with valid URLs
        url = evidence.get("url", "")
        if not url or url == "None":
            continue
            
        sources.append(FactSource(
            title=evidence.get("title", "Unknown"),
            url=url,
            snippet=evidence.get("snippet") or evidence.get("evidenceSnippet", "")
        ))
    
    return FactCheckResult(
        verdict=verdict,
        confidence=confidence,
        reasoning=reasoning,
        sources=sources
    )


async def detect_claims(text: str) -> List[Dict[str, Any]]:
    """
    Detect and extract claims from text using Factiverse claim detection.
    
    This is useful as an alternative to Claude for claim extraction,
    or as a validation step.
    
    Args:
        text: The text to analyze for claims
        
    Returns:
        List of detected claims with metadata
    """
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "text": text,
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/claim_detection",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            data = response.json()
            return _extract_detected_claims(data)
    except Exception as e:
        print(f"Error in claim detection: {str(e)}")
        return []


def _extract_detected_claims(data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten the Factiverse claim detection response."""
    claims: List[Dict[str, Any]] = []

    def _collect(container: Dict[str, Any]):
        detected = container.get("detectedClaims")
        if isinstance(detected, list):
            claims.extend(detected)
        nested = container.get("data")
        if isinstance(nested, list):
            for item in nested:
                if isinstance(item, dict):
                    _collect(item)

    if isinstance(data, dict):
        _collect(data)

    # Normalize to a predictable structure
    normalized = []
    for claim in claims:
        text = claim.get("claim") or claim.get("text")
        if not text:
            continue
        normalized.append({
            "id": claim.get("_id") or claim.get("id"),
            "text": text,
            "score": claim.get("score"),
            "resolvedClaim": claim.get("resolved_claim") or claim.get("resolvedClaim")
        })
    return normalized


async def get_stance_detection(claim_text: str) -> Dict[str, Any]:
    """
    Get supporting and refuting viewpoints for a claim.
    
    This provides more detailed stance analysis than fact_check.
    
    Args:
        claim_text: The claim to analyze
        
    Returns:
        Dictionary with supporting and refuting viewpoints
    """
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "claim": claim_text,
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/stance_detection",
                headers=headers,
                json=payload
            )
            response.raise_for_status()
            return response.json()
            
    except Exception as e:
        print(f"Error in stance detection: {str(e)}")
        return {
            "supporting": [],
            "refuting": []
        }

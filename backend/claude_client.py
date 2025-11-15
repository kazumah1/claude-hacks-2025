"""
Claude API Client for Claim Extraction

This module provides functions to interact with the Claude API
for extracting factual claims from debate transcript segments.
"""

import os
import time
from typing import List, Dict, Any, Optional
from anthropic import Anthropic
import json


# Claude API Configuration
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-5")

# Initialize the Anthropic client
client = Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None

# Rate limiting: Track last extraction time per session
_last_extraction_time: Dict[str, float] = {}
EXTRACTION_INTERVAL_SECONDS = 5.0  # Extract one claim every 15 seconds


def _extract_json_payload(text: str) -> str:
    """
    Claude sometimes wraps JSON in ```json fences; strip them for json.loads.
    """
    stripped = text.strip()
    if not stripped:
        return stripped

    if stripped.startswith("```"):
        parts = stripped.split("```")
        for part in parts:
            candidate = part.strip()
            if not candidate:
                continue
            if candidate.lower().startswith("json"):
                candidate = candidate[4:].strip()
            if candidate.startswith("{") or candidate.startswith("["):
                return candidate
    return stripped


async def extract_claim_from_text(
    text: str,
    speaker: Optional[str] = None,
    session_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Extract a single verifiable factual claim from transcript text using Claude API.

    Rate limiting: Extracts one claim every 15 seconds per session to avoid overwhelming
    the fact-checking API and reduce costs.

    This function uses Claude to:
    1. Identify the most important factual claim in the text
    2. Extract it in a clean, verifiable format
    3. Return it ready for fact-checking with Factiverse

    Args:
        text: The transcript segment text to analyze
        speaker: Optional speaker identifier (e.g., "spk_0", "Speaker A")
        session_id: Optional session identifier for rate limiting

    Returns:
        Dictionary with extracted claim information, or None if:
        - No claim found
        - Rate limit not met (too soon since last extraction)
        {
            "text": "The extracted claim text",
            "needsFactCheck": true,
            "fallacy": "none"
        }
    """
    if not client:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. Please set the environment variable."
        )

    # Rate limiting: Check if enough time has passed since last extraction
    if session_id:
        current_time = time.time()
        last_time = _last_extraction_time.get(session_id, 0)
        time_since_last = current_time - last_time

        if time_since_last < EXTRACTION_INTERVAL_SECONDS:
            # Too soon - skip this extraction
            time_remaining = EXTRACTION_INTERVAL_SECONDS - time_since_last
            print(f"Rate limit: Skipping extraction (wait {time_remaining:.1f}s more)")
            return None

        # Update last extraction time for this session
        _last_extraction_time[session_id] = current_time

    # Construct the prompt for Claude
    speaker_context = f" by {speaker}" if speaker else ""

    prompt = f"""You are analyzing a debate transcript segment{speaker_context}. Your task is to extract exactly ONE verifiable factual claim from the following text.

Text to analyze:
"{text}"

Instructions:
1. Concatenate this conversation into a single provable or disprovable claim.
2. Extract it as a clear, standalone statement
3. If the text contains no factual claims (e.g., it's just an opinion, question, or greeting), return "NO_CLAIM"
4. Return ONLY the claim text, nothing else

Examples of good claim extraction:
- Input: "I think Cuomo wants to abolish all policing in New York"
  Output: "Cuomo wants to abolish all policing in New York"

- Input: "Studies show that 90% of Americans support universal healthcare"
  Output: "90% of Americans support universal healthcare"

- Input: "How are you doing today?"
  Output: NO_CLAIM

- Input: "I believe that's a terrible idea"
  Output: NO_CLAIM

Now extract the claim:"""

    try:
        # Call Claude API
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=200,
            temperature=0.0,  # Deterministic for consistent extraction
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        # Extract the response text
        if not message.content or len(message.content) == 0:
            return None

        claim_text = message.content[0].text.strip()

        # Check if Claude found no claim
        if claim_text == "NO_CLAIM" or not claim_text:
            return None

        # Return the extracted claim
        return {
            "text": claim_text,
            "needsFactCheck": True,
            "fallacy": "none"  # Fallacy detection can be added in future iterations
        }

    except Exception as e:
        print(f"Error calling Claude API: {str(e)}")
        import traceback
        traceback.print_exc()
        # Return None on error rather than failing the whole pipeline
        return None


def reset_rate_limiter(session_id: Optional[str] = None):
    """
    Reset the rate limiter for a specific session or all sessions.

    Args:
        session_id: Optional session ID to reset. If None, resets all sessions.
    """
    if session_id:
        _last_extraction_time.pop(session_id, None)
        print(f"Rate limiter reset for session: {session_id}")
    else:
        _last_extraction_time.clear()
        print("Rate limiter reset for all sessions")


async def extract_claims_batch(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Extract claims from multiple transcript segments in batch.

    This is more efficient for processing multiple segments at once.

    Args:
        segments: List of segment dictionaries with 'text' and optionally 'speaker'

    Returns:
        List of extracted claims with metadata
    """
    results = []

    for segment in segments:
        text = segment.get("text", "")
        speaker = segment.get("speaker")

        if not text.strip():
            continue

        claim = await extract_claim_from_text(text, speaker)

        if claim:
            # Add segment metadata to the claim
            claim["segmentId"] = segment.get("id")
            claim["speaker"] = speaker
            claim["start"] = segment.get("start")
            claim["end"] = segment.get("end")
            results.append(claim)

    return results


async def analyze_claim_with_context(
    text: str,
    speaker: Optional[str] = None,
    detect_fallacies: bool = False
) -> Optional[Dict[str, Any]]:
    """
    Advanced claim extraction with fallacy detection.

    This function provides more detailed analysis including:
    - Claim extraction
    - Fallacy detection (if enabled)
    - Reasoning about why it needs fact-checking

    Args:
        text: The transcript segment text to analyze
        speaker: Optional speaker identifier
        detect_fallacies: Whether to detect logical fallacies

    Returns:
        Dictionary with claim and analysis, or None if no claim found
    """
    if not client:
        raise ValueError(
            "ANTHROPIC_API_KEY not set. Please set the environment variable."
        )

    speaker_context = f" by {speaker}" if speaker else ""

    fallacy_instruction = """
4. Detect if the claim contains any logical fallacy (strawman, ad_hominem, false_dichotomy, slippery_slope, appeal_to_authority, etc.)
5. If a fallacy is present, identify it; otherwise return "none"
""" if detect_fallacies else ""

    prompt = f"""You are analyzing a debate transcript segment{speaker_context}. Extract factual claims and analyze them.

Text to analyze:
"{text}"

Instructions:
1. Identify the MOST IMPORTANT factual claim that can be fact-checked
2. Extract it as a clear, standalone statement
3. Determine if it needs fact-checking (true for factual claims, false for opinions/questions)
{fallacy_instruction}
Respond in JSON format:
{{
    "claim": "the extracted claim text or null if none",
    "needsFactCheck": true/false,
    "fallacy": "none" or fallacy type{', "reasoning": "why this claim needs checking"' if detect_fallacies else ''}
}}

Examples:
{{"claim": "Cuomo wants to abolish all policing", "needsFactCheck": true, "fallacy": "strawman"}}
{{"claim": null, "needsFactCheck": false, "fallacy": "none"}}"""

    try:
        message = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            temperature=0.0,
            messages=[
                {
                    "role": "user",
                    "content": prompt
                }
            ]
        )

        if not message.content or len(message.content) == 0:
            return None

        response_text = message.content[0].text.strip()

        # Parse JSON response
        try:
            payload = _extract_json_payload(response_text)
            result = json.loads(payload)

            if not result.get("claim"):
                return None

            return {
                "text": result["claim"],
                "needsFactCheck": result.get("needsFactCheck", True),
                "fallacy": result.get("fallacy", "none"),
                "reasoning": result.get("reasoning")
            }

        except json.JSONDecodeError:
            print(f"Failed to parse Claude response as JSON: {response_text}")
            return None

    except Exception as e:
        print(f"Error calling Claude API: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

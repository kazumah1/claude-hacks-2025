# Factiverse Live Fact-Checking Template

This template provides a complete implementation for live fact-checking using the Factiverse API.

## Overview

The implementation consists of three main components:

1. **`factiverse_client.py`** - Client library for interacting with Factiverse API
2. **`models.py`** - Data models matching the frontend TypeScript types
3. **`main.py`** - FastAPI endpoints for fact-checking integration

## Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. The API key is already configured in `factiverse_client.py`. To use a different key, set the `FACTIVERSE_API_KEY` environment variable.

3. Run the backend server:
```bash
uvicorn main:app --reload --port 8000
```

## API Endpoints

### 1. `/api/fact-check` - Fact-check a single claim

**POST** `/api/fact-check`

Request body:
```json
{
  "claimText": "The claim to fact-check"
}
```

Response:
```json
{
  "verdict": "supported" | "disputed" | "likely_false" | "uncertain",
  "confidence": 0.85,
  "reasoning": "Explanation of the verdict...",
  "sources": [
    {
      "title": "Source Article Title",
      "url": "https://example.com/article",
      "snippet": "Relevant excerpt from the source..."
    }
  ]
}
```

### 2. `/api/analyze-segment` - Analyze a transcript segment

**POST** `/api/analyze-segment`

This endpoint:
- Accepts a transcript segment
- Extracts claims (currently placeholder - will integrate with Claude API)
- Fact-checks each claim using Factiverse
- Returns enriched claims with verdicts and sources

Request body:
```json
{
  "id": "seg_1",
  "sessionId": "live_abc123",
  "speaker": "spk_0",
  "start": 12.3,
  "end": 15.8,
  "text": "I think Cuomo wants to abolish all policing."
}
```

Response:
```json
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
    "sources": [
      {
        "title": "Fact-check article",
        "url": "https://...",
        "snippet": "..."
      }
    ]
  }
]
```

### 3. `/api/live/start` - Start a live session

**POST** `/api/live/start`

Request body (optional):
```json
{
  "speakers": {
    "spk_0": "Speaker A",
    "spk_1": "Speaker B"
  }
}
```

### 4. `/api/live/state` - Get session state

**GET** `/api/live/state?sessionId=live_abc123`

Returns the current state of a live session including all segments and claims.

## Integration with Claude API

To complete the implementation, you need to integrate Claude API in the `analyze_segment` function in `main.py`. The current implementation has a placeholder where Claude should:

1. Extract distinct claims from the segment text
2. Detect logical fallacies for each claim
3. Mark which claims need fact-checking

Example Claude integration (to be added):

```python
async def extract_claims_with_claude(segment_text: str) -> List[Dict]:
    """
    Call Claude API to extract claims and detect fallacies.
    Returns list of claims with fallacy types.
    """
    # TODO: Implement Claude API call
    # Use the prompt from PROJECT.md section 7
    pass
```

Then update the `analyze_segment` function to use this:

```python
# Replace the placeholder with:
claims_to_check = await extract_claims_with_claude(segment.text)
```

## Factiverse API Functions

The `factiverse_client.py` module provides several functions:

### `fact_check_claim(claim_text: str) -> FactCheckResult`

Main function for fact-checking a claim. Uses the `/v1/stance_detection` endpoint which:
- Scores the claim
- Provides supporting/refuting evidence
- Returns a verdict + summary

### `detect_claims(text: str) -> List[Dict]`

Alternative claim detection using Factiverse's `/v1/claim_detection` endpoint. Returns a list of claim dictionaries with `text`, `score`, and optional `resolvedClaim`. Can be used as a validation step or alternative to Claude.

### `get_stance_detection(claim_text: str) -> Dict`

Get detailed supporting and refuting viewpoints for a claim using `/v1/stance_detection`.

## Verdict Mapping

The Factiverse API stance is mapped to verdicts as follows:

- `"support"` or `"true"` → `"supported"`
- `"refute"` or `"false"` → `"likely_false"`
- `"dispute"` or `"contradict"` → `"disputed"`
- Otherwise → `"uncertain"`

## Usage Example

```python
from factiverse_client import fact_check_claim

# Fact-check a claim
result = await fact_check_claim("The Earth is flat")
print(f"Verdict: {result.verdict}")
print(f"Confidence: {result.confidence}")
print(f"Reasoning: {result.reasoning}")
for source in result.sources:
    print(f"- {source.title}: {source.url}")
```

## Frontend Integration

The frontend can call these endpoints from the Next.js app:

```typescript
// Fact-check a claim
const response = await fetch('http://localhost:8000/api/fact-check', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ claimText: 'Your claim here' })
});
const result = await response.json();

// Analyze a segment (from STT)
const segmentResponse = await fetch('http://localhost:8000/api/analyze-segment', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    id: 'seg_1',
    sessionId: 'live_abc123',
    speaker: 'spk_0',
    start: 12.3,
    end: 15.8,
    text: 'Transcript text here'
  })
});
const claims = await segmentResponse.json();
```

## Error Handling

The implementation includes error handling:
- API errors return `"uncertain"` verdict with error details in reasoning
- Missing claims return `"uncertain"` verdict
- Network timeouts are set to 30 seconds

## Next Steps

1. **Integrate Claude API** - Replace the placeholder in `analyze_segment` with actual Claude API calls
2. **Add caching** - Cache fact-check results to avoid redundant API calls
3. **Add rate limiting** - Implement rate limiting for the Factiverse API
4. **Add logging** - Add proper logging for debugging and monitoring
5. **Add tests** - Create unit tests for the fact-checking functions

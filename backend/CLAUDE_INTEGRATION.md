# Claude API Integration for Claim Extraction

This document explains how Claude API has been integrated into the backend to extract claims from Deepgram transcriptions and fact-check them with Factiverse.

## Overview

The integration creates a three-stage pipeline:

```
Deepgram (Speech → Text) → Claude (Text → Claims) → Factiverse (Claims → Fact-Check)
```

### Flow

1. **Deepgram**: Transcribes live audio into text segments with speaker diarization
2. **Claude**: Extracts exactly 1 verifiable factual claim from each text segment
3. **Factiverse**: Fact-checks the extracted claim and returns verdict + sources

## Files Added/Modified

### New Files

- **`claude_client.py`**: Claude API client for claim extraction
  - `extract_claim_from_text()`: Extracts a single claim from a text segment
  - `extract_claims_batch()`: Batch processing for multiple segments
  - `analyze_claim_with_context()`: Advanced extraction with fallacy detection

- **`test_claude_integration.py`**: Test script to verify the integration
  - Run with: `python test_claude_integration.py`
  - Tests the complete pipeline with various example inputs

### Modified Files

- **`main.py`**: Updated `/api/analyze-segment` endpoint
  - Now uses Claude to extract claims instead of Factiverse claim detection
  - Cleaner pipeline: Deepgram → Claude → Factiverse

- **`requirements.txt`**: Added `httpx==0.28.1` dependency

- **`.env.example`**: Added both API key requirements

## API Endpoints

### `/api/analyze-segment` (POST)

Analyzes a transcript segment to extract and fact-check claims.

**Request:**
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

**Response:**
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
    "fallacy": "none",
    "needsFactCheck": true,
    "verdict": "likely_false",
    "confidence": 0.85,
    "reasoning": "This claim misrepresents the actual policy position...",
    "sources": [...]
  }
]
```

**Note:** If no factual claim is detected, the response will be an empty array `[]`.

## Setup Instructions

### 1. Install Dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Set Environment Variables

Create a `.env` file in the `backend/` directory:

```bash
# Anthropic API Key (required for Claude)
ANTHROPIC_API_KEY=sk-ant-...

# Factiverse API Key (required for fact-checking)
FACTIVERSE_API_KEY=eyJhbGci...
```

**Get API Keys:**
- **Claude API**: https://console.anthropic.com/
- **Factiverse API**: https://factiverse.ai/

### 3. Run the Backend

```bash
uvicorn main:app --reload --port 8000
```

### 4. Test the Integration

```bash
# Full test with multiple examples
python test_claude_integration.py

# Simple test with one claim
python test_claude_integration.py simple
```

## How It Works

### Claude Claim Extraction

The `extract_claim_from_text()` function uses Claude 3.5 Sonnet to:

1. **Identify** the most important factual claim in the text
2. **Extract** it as a clean, standalone statement
3. **Filter** non-claims (opinions, questions, greetings)

**Example:**

Input:
```
"I think Cuomo wants to abolish all policing in New York"
```

Claude extracts:
```
"Cuomo wants to abolish all policing in New York"
```

### Prompt Engineering

The prompt is designed to:
- Focus on **factual claims** only (not opinions or questions)
- Extract **the most important** claim if multiple exist
- Return `NO_CLAIM` for non-factual segments
- Use **temperature=0.0** for deterministic, consistent results

### Factiverse Fact-Checking

Once a claim is extracted, it's sent to Factiverse which:

1. Searches fact-checking databases
2. Finds supporting/refuting evidence
3. Returns:
   - **Verdict**: `supported`, `disputed`, `likely_false`, `uncertain`
   - **Confidence**: 0.0-1.0 score
   - **Reasoning**: Summary of the fact-check
   - **Sources**: Evidence with URLs and snippets

## Integration Benefits

### Why Claude for Claim Extraction?

1. **Better accuracy**: Claude understands context and nuance better than keyword-based extraction
2. **Cleaner output**: Extracts claims in verifiable format
3. **Filters noise**: Automatically ignores questions, greetings, and pure opinions
4. **Customizable**: Can be extended to detect logical fallacies

### Why Separate Claude + Factiverse?

- **Claude**: Best at understanding natural language and extracting structure
- **Factiverse**: Best at fact-checking against verified databases
- **Together**: Complete pipeline from messy speech to verified facts

## Example Use Cases

### 1. Live Debate Fact-Checking

```
Speaker: "Studies show that 90% of Americans support universal healthcare"
         ↓
Claude:  "90% of Americans support universal healthcare"
         ↓
Factiverse: "DISPUTED - Confidence: 0.72 - Sources show varying support levels..."
```

### 2. Filtering Non-Claims

```
Speaker: "How are you doing today?"
         ↓
Claude:  NO_CLAIM (returns null)
         ↓
Result:  No fact-check needed, empty response
```

### 3. Strawman Detection (Future)

```
Speaker: "My opponent wants to ban all cars!"
         ↓
Claude:  Claim: "Opponent wants to ban all cars" + Fallacy: "strawman"
         ↓
Factiverse: Fact-check result
```

## Advanced Features

### Batch Processing

Process multiple segments at once:

```python
from claude_client import extract_claims_batch

segments = [
    {"text": "The Earth is flat", "speaker": "spk_0"},
    {"text": "Water is H2O", "speaker": "spk_1"}
]

claims = await extract_claims_batch(segments)
```

### Fallacy Detection

Enable logical fallacy detection:

```python
from claude_client import analyze_claim_with_context

result = await analyze_claim_with_context(
    text="My opponent wants to ban all cars!",
    speaker="spk_0",
    detect_fallacies=True
)

# Returns:
# {
#   "text": "Opponent wants to ban all cars",
#   "fallacy": "strawman",
#   "needsFactCheck": true,
#   "reasoning": "This misrepresents the opponent's position..."
# }
```

## Troubleshooting

### API Key Issues

**Error:** `ANTHROPIC_API_KEY not set`

**Solution:**
```bash
# Make sure .env file exists in backend/ directory
echo "ANTHROPIC_API_KEY=sk-ant-your-key-here" > .env
```

### Rate Limits

- **Claude**: 50 requests/min on free tier
- **Factiverse**: Check your plan limits

**Solution:** Implement rate limiting or upgrade your plan

### No Claims Extracted

If Claude returns `null` for segments with claims:

1. Check the prompt in `claude_client.py`
2. Verify the text actually contains factual claims
3. Test with the test script to see examples

## Next Steps

### Potential Improvements

1. **Caching**: Cache Claude responses for identical segments
2. **Streaming**: Stream results back to frontend as they arrive
3. **Fallacy Detection**: Enable and tune fallacy detection
4. **Multi-claim**: Extract multiple claims per segment
5. **Confidence Scoring**: Add Claude's confidence in extraction

## API Documentation

### Claude API

- **Model**: `claude-3-5-sonnet-20241022`
- **Max Tokens**: 200 (for claim extraction)
- **Temperature**: 0.0 (deterministic)
- **Docs**: https://docs.anthropic.com/

### Factiverse API

- **Endpoint**: `POST /v1/stance_detection`
- **Timeout**: 60 seconds
- **Docs**: https://api.factiverse.ai/docs

## Support

For issues or questions:

1. Check the test script output
2. Review the logs in the terminal
3. Verify both API keys are valid
4. Check API rate limits

## License

Same as the main project.

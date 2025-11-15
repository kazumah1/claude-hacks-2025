# Backend API - Fact Checking with Factiverse

This backend provides a complete template for implementing live fact-checking using the Factiverse API.

## Quick Start

1. **Create and activate a virtual environment:**
```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

2. **Install dependencies:**
```bash
pip install -r requirements.txt
```

3. **Run the server:**
```bash
uvicorn main:app --reload --port 8000
```

Or if `uvicorn` is not in PATH:
```bash
python -m uvicorn main:app --reload --port 8000
```

4. **Test the API:**
```bash
# In another terminal (with venv activated)
python example_usage.py
```

## Files Overview

- **`main.py`** - FastAPI application with fact-checking endpoints
- **`factiverse_client.py`** - Client library for Factiverse API integration
- **`models.py`** - Pydantic models matching frontend TypeScript types
- **`requirements.txt`** - Python dependencies
- **`example_usage.py`** - Example script demonstrating API usage
- **`FACTIVERSE_TEMPLATE.md`** - Detailed documentation

## API Endpoints

### POST `/api/fact-check`
Fact-check a single claim.

### POST `/api/analyze-segment`
Analyze a transcript segment, extract claims, and fact-check them.

### POST `/api/live/start`
Start a new live debate session.

### GET `/api/live/state`
Get the current state of a live session.

See `FACTIVERSE_TEMPLATE.md` for detailed API documentation.

## Integration Status

✅ **Completed:**
- Factiverse API client implementation
- Fact-checking endpoints
- Session management
- Frontend API client (`next-app/app/lib/factCheckApi.ts`)

⏳ **Pending:**
- Claude API integration for claim extraction (placeholder in `analyze_segment`)
- STT integration for live transcription

## Next Steps

1. Integrate Claude API in `main.py` → `analyze_segment` function
2. Add STT service for live transcription
3. Test with real debate segments
4. Add caching and rate limiting


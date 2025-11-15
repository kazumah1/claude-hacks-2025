"""
Example usage of the Factiverse fact-checking API.

This script demonstrates how to use the fact-checking endpoints.
Run the FastAPI server first (uvicorn main:app --reload), then run this script.
"""

import asyncio
import httpx


async def example_fact_check():
    """Example: Fact-check a single claim"""
    async with httpx.AsyncClient(timeout=90.0) as client:
        response = await client.post(
            "http://localhost:8000/api/fact-check",
            json={
                "claimText": "Zohran Mamdani is muslim."
            }
        )
        result = response.json()
        print("Fact-Check Result:")
        print(f"  Verdict: {result['verdict']}")
        print(f"  Confidence: {result.get('confidence', 'N/A')}")
        print(f"  Reasoning: {result.get('reasoning', 'N/A')}")
        print(f"  Sources: {len(result.get('sources', []))} sources found")
        for source in result.get('sources', [])[:3]:  # Show first 3
            print(f"    - {source['title']}: {source['url']}")


async def example_analyze_segment():
    """Example: Analyze a transcript segment"""
    # First, start a session
    async with httpx.AsyncClient(timeout=90.0) as client:
        # Start session
        session_response = await client.post(
            "http://localhost:8000/api/live/start",
            json={
                "speakers": {
                    "spk_0": "Speaker A",
                    "spk_1": "Speaker B"
                }
            }
        )
        session = session_response.json()
        session_id = session["sessionId"]
        print(f"Started session: {session_id}")
        
        # Analyze a segment
        import uuid
        segment = {
            "id": f"seg_{uuid.uuid4().hex[:8]}",
            "sessionId": session_id,
            "speaker": "spk_0",
            "start": 12.3,
            "end": 15.8,
            "text": "Zohran Mamdani is muslim."
        }
        
        analyze_response = await client.post(
            "http://localhost:8000/api/analyze-segment",
            json=segment
        )
        claims = analyze_response.json()
        
        print(f"\nAnalyzed segment, found {len(claims)} claim(s):")
        for claim in claims:
            print(f"\n  Claim: {claim['text']}")
            print(f"    Verdict: {claim['verdict']}")
            print(f"    Confidence: {claim.get('confidence', 'N/A')}")
            print(f"    Fallacy: {claim['fallacy']}")
            if claim.get('sources'):
                print(f"    Sources: {len(claim['sources'])} found")
        
        # Get session state
        state_response = await client.get(
            f"http://localhost:8000/api/live/state?sessionId={session_id}"
        )
        state = state_response.json()
        print(f"\nSession state:")
        print(f"  Segments: {len(state['segments'])}")
        print(f"  Claims: {len(state['claims'])}")


async def main():
    print("=" * 60)
    print("Example 1: Fact-check a single claim")
    print("=" * 60)
    await example_fact_check()
    
    print("\n" + "=" * 60)
    print("Example 2: Analyze a transcript segment")
    print("=" * 60)
    await example_analyze_segment()


if __name__ == "__main__":
    asyncio.run(main())

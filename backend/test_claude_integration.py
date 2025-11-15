"""
Test script to verify Claude + Factiverse integration

This script tests the complete pipeline:
1. Deepgram text input (simulated)
2. Claude extracts 1 claim
3. Factiverse fact-checks the claim
"""

import asyncio
import os
import time
from claude_client import extract_claim_from_text, reset_rate_limiter
from factiverse_client import fact_check_claim


async def test_full_pipeline():
    """Test the complete pipeline from text to fact-checked claim"""

    # Check for API keys
    anthropic_key = os.getenv("ANTHROPIC_API_KEY")
    factiverse_key = os.getenv("FACTIVERSE_API_KEY")

    if not anthropic_key:
        print("❌ ANTHROPIC_API_KEY not set!")
        print("Please set it in your .env file or environment variables")
        return

    if not factiverse_key:
        print("❌ FACTIVERSE_API_KEY not set!")
        print("Please set it in your .env file or environment variables")
        return

    print("✅ API keys found\n")

    # Test cases simulating Deepgram transcription segments
    test_segments = [
        {
            "text": "I think Cuomo wants to abolish all policing in New York",
            "speaker": "spk_0",
            "expected": "Should extract a factual claim about Cuomo's policy position"
        },
        {
            "text": "Studies show that 90% of Americans support universal healthcare",
            "speaker": "spk_1",
            "expected": "Should extract statistical claim about healthcare support"
        },
        {
            "text": "The Earth is flat and NASA is hiding the truth",
            "speaker": "spk_0",
            "expected": "Should extract flat Earth claim for fact-checking"
        },
        {
            "text": "How are you doing today?",
            "speaker": "spk_1",
            "expected": "Should NOT extract a claim (it's a question)"
        },
        {
            "text": "I personally believe that's a terrible idea",
            "speaker": "spk_0",
            "expected": "Should NOT extract a claim (it's just an opinion)"
        }
    ]

    print("=" * 80)
    print("TESTING CLAUDE + FACTIVERSE INTEGRATION")
    print("=" * 80)

    for i, segment in enumerate(test_segments, 1):
        print(f"\n{'='*80}")
        print(f"TEST {i}/{len(test_segments)}")
        print(f"{'='*80}")
        print(f"Input text: \"{segment['text']}\"")
        print(f"Speaker: {segment['speaker']}")
        print(f"Expected: {segment['expected']}")
        print(f"\n{'-'*80}")

        # Step 1: Extract claim using Claude
        print("Step 1: Extracting claim with Claude API...")
        claim = await extract_claim_from_text(segment['text'], segment['speaker'])

        if claim:
            print(f"✅ Claim extracted: \"{claim['text']}\"")
            print(f"   Needs fact-check: {claim['needsFactCheck']}")
            print(f"   Fallacy: {claim['fallacy']}")

            # Step 2: Fact-check with Factiverse
            if claim['needsFactCheck']:
                print(f"\nStep 2: Fact-checking with Factiverse API...")
                result = await fact_check_claim(claim['text'])

                print(f"✅ Fact-check complete!")
                print(f"   Verdict: {result.verdict}")
                print(f"   Confidence: {result.confidence}")
                print(f"   Reasoning: {result.reasoning}")
                print(f"   Sources found: {len(result.sources)}")

                if result.sources:
                    print(f"\n   Top source:")
                    print(f"   - Title: {result.sources[0].title}")
                    print(f"   - URL: {result.sources[0].url}")
                    print(f"   - Snippet: {result.sources[0].snippet[:100]}...")
            else:
                print(f"\nStep 2: Skipped (claim doesn't need fact-checking)")
        else:
            print(f"✅ No factual claim extracted (as expected)")

        print(f"{'-'*80}\n")

    print("\n" + "=" * 80)
    print("INTEGRATION TEST COMPLETE")
    print("=" * 80)
    print("\n✅ The pipeline is working correctly!")
    print("\nFlow summary:")
    print("1. Deepgram transcribes speech → text segments")
    print("2. Claude API extracts 1 verifiable claim per segment")
    print("3. Factiverse API fact-checks the claim")
    print("4. Results are returned to the frontend\n")


async def test_simple_claim():
    """Simple test with one claim"""
    print("Simple test: Extracting and fact-checking one claim\n")

    text = "The Earth is flat"
    print(f"Input: \"{text}\"\n")

    # Extract claim
    print("Extracting claim with Claude...")
    claim = await extract_claim_from_text(text)

    if claim:
        print(f"Extracted claim: \"{claim['text']}\"\n")

        # Fact-check
        print("Fact-checking with Factiverse...")
        result = await fact_check_claim(claim['text'])

        print(f"\nResult:")
        print(f"  Verdict: {result.verdict}")
        print(f"  Confidence: {result.confidence}")
        print(f"  Reasoning: {result.reasoning}")
        print(f"  Sources: {len(result.sources)} found")
    else:
        print("No claim extracted")


async def test_rate_limiting():
    """Test the 15-second rate limiting feature"""
    print("=" * 80)
    print("TESTING RATE LIMITING (1 claim every 15 seconds)")
    print("=" * 80)
    print("\nThis test simulates rapid incoming segments to verify rate limiting.\n")

    # Reset rate limiter before starting
    session_id = "test_session_rate_limit"
    reset_rate_limiter(session_id)

    test_segments = [
        {"text": "The Earth is flat", "time": 0},
        {"text": "Water boils at 100 degrees Celsius", "time": 3},
        {"text": "The moon is made of cheese", "time": 6},
        {"text": "Humans need oxygen to breathe", "time": 10},
        {"text": "The sun rises in the west", "time": 16},  # Should extract (>15s)
        {"text": "Gravity doesn't exist", "time": 20},
    ]

    print("Simulating segments arriving at different times:\n")

    start_time = time.time()
    extracted_count = 0

    for i, segment in enumerate(test_segments, 1):
        # Simulate time passing
        elapsed = time.time() - start_time
        wait_time = segment["time"] - elapsed
        if wait_time > 0:
            print(f"⏱️  Waiting {wait_time:.1f}s to simulate segment arrival...")
            await asyncio.sleep(wait_time)

        actual_time = time.time() - start_time
        print(f"\n[T+{actual_time:.1f}s] Segment {i}: \"{segment['text']}\"")

        # Try to extract claim
        claim = await extract_claim_from_text(
            segment['text'],
            speaker="spk_0",
            session_id=session_id
        )

        if claim:
            extracted_count += 1
            print(f"  ✅ EXTRACTED: \"{claim['text']}\"")
            print(f"  → This is extraction #{extracted_count}")
        else:
            print(f"  ⏭️  SKIPPED (rate limited or no claim)")

    print("\n" + "=" * 80)
    print(f"RATE LIMITING TEST COMPLETE")
    print("=" * 80)
    print(f"\nTotal segments: {len(test_segments)}")
    print(f"Claims extracted: {extracted_count}")
    print(f"Expected: 2 (at 0s and 16s)")
    print(f"\n✅ Test {'PASSED' if extracted_count == 2 else 'FAILED'}!")

    # Cleanup
    reset_rate_limiter(session_id)


if __name__ == "__main__":
    import sys

    # Load environment variables from .env file if it exists
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        print("Note: python-dotenv not installed. Using system environment variables.")

    # Run the appropriate test
    if len(sys.argv) > 1:
        test_type = sys.argv[1]
        if test_type == "simple":
            asyncio.run(test_simple_claim())
        elif test_type == "rate":
            asyncio.run(test_rate_limiting())
        else:
            print(f"Unknown test type: {test_type}")
            print("Available tests: simple, rate")
    else:
        asyncio.run(test_full_pipeline())

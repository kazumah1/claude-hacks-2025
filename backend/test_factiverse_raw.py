"""
Test script to see the raw Factiverse API response format
"""

import asyncio
import httpx
import json
import os

FACTIVERSE_API_BASE = "https://api.factiverse.ai"
FACTIVERSE_API_KEY = os.getenv(
    "FACTIVERSE_API_KEY",
    "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6IldHaG9KLXExbllVbXNJQXRubktJMyJ9.eyJ1c2VyX2VtYWlsIjoiYWtzaGF5LnNoaXZrdW1hckBiZXJrZWxleS5lZHUiLCJ1c2VyX25ldyI6dHJ1ZSwic3RyaXBlX2N1c3RvbWVyX2lkIjoiY3VzX1RRTHRJWWxMVFN2eERPIiwic3RyaXBlX3BhaWRfdXNlciI6ZmFsc2UsImlzcyI6Imh0dHBzOi8vYXV0aC5mYWN0aXZlcnNlLmFpLyIsInN1YiI6Imdvb2dsZS1vYXV0aDJ8MTA2NTg1MDk5NTIyODAwNTY4MTk1IiwiYXVkIjpbImh0dHBzOi8vZmFjdGl2ZXJzZS9hcGkiLCJodHRwczovL2ZhY3RpdmVyc2UtYXV0aC5ldS5hdXRoMC5jb20vdXNlcmluZm8iXSwiaWF0IjoxNzYzMTU4MTY4LCJleHAiOjE3NjU3NTAxNjgsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUgZW1haWwgcG9zdDpmZWVkYmFjayBwb3N0OmJpYXNfZGV0ZWN0aW9uIHBvc3Q6Y2xhaW1fZGV0ZWN0aW9uIHBvc3Q6c2VhcmNoIHBvc3Q6ZmFjdF9jaGVjayBwb3N0OnN0YW5jZV9kZXRlY3Rpb24gcG9zdDpjbGFpbV9zZWFyY2ggb2ZmbGluZV9hY2Nlc3MiLCJhenAiOiJhMmVacFF2NmpiSHJMRUFBQ0xibHAyNW1ydFZSaUxpRSJ9.KnODkIcaOuf__9MEpmZGgUAxuPLuxoSbQgxobf25X_DdhxgE5ZU8OV9W1slaxM7RxEO0n-pCPsNqXZKBKDtHLOnxZS0RPkQJ1dVx6LhlWsKr6HkkpdWhKiBDLNViXHYobeHOOULHGi3SSnVrfxdqEZPuy2spTXxiBA-vEeew0xwv88z9pAA66fcwhN_sYm50i8wKBDO69t3aNJIzhzRPLDKU87dTh_JG4uHc4IoVrOfxOMLzASIter2p90ETHtmoBu8SsvJSZm3wlf92Zb5JRau62OU8ui9a9k8u9gjwrO-EKfNh9x6chMYSkzqdoqcoKlfCMT9kv30iKxxmI2haAQ"
)


async def test_fact_check():
    """Test the fact_check endpoint and print raw response"""
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "text": "The Earth is flat",
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/fact_check",
                headers=headers,
                json=payload
            )
            print(f"Status Code: {response.status_code}")
            print(f"Response Headers: {dict(response.headers)}")
            print("\n" + "=" * 60)
            print("RAW RESPONSE:")
            print("=" * 60)
            data = response.json()
            print(json.dumps(data, indent=2))
            
    except httpx.HTTPStatusError as e:
        print(f"HTTP Error: {e.response.status_code}")
        print(f"Response: {e.response.text}")
    except Exception as e:
        print(f"Error: {str(e)}")


async def test_claim_detection():
    """Test the claim_detection endpoint"""
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "text": "The Earth is flat",
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/claim_detection",
                headers=headers,
                json=payload
            )
            print("\n" + "=" * 60)
            print("CLAIM DETECTION RESPONSE:")
            print("=" * 60)
            data = response.json()
            print(json.dumps(data, indent=2))
            
    except Exception as e:
        print(f"Error: {str(e)}")


async def test_stance_detection():
    """Test the stance_detection endpoint"""
    headers = {
        "Authorization": f"Bearer {FACTIVERSE_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "claim": "The Earth is flat",
        "language": "en"
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{FACTIVERSE_API_BASE}/v1/stance_detection",
                headers=headers,
                json=payload
            )
            print("\n" + "=" * 60)
            print("STANCE DETECTION RESPONSE:")
            print("=" * 60)
            data = response.json()
            print(json.dumps(data, indent=2))
            
    except Exception as e:
        print(f"Error: {str(e)}")


async def main():
    print("Testing Factiverse API endpoints...")
    await test_fact_check()
    await test_claim_detection()
    await test_stance_detection()


if __name__ == "__main__":
    asyncio.run(main())


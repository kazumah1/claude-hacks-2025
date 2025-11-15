/**
 * Frontend API client for fact-checking endpoints
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface FactCheckResult {
  verdict: 'supported' | 'disputed' | 'likely_false' | 'uncertain' | 'not_checked';
  confidence?: number;
  reasoning?: string;
  sources?: FactSource[];
}

export interface FactSource {
  title: string;
  url: string;
  snippet: string;
}

export interface Segment {
  id: string;
  sessionId: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
}

export interface Claim {
  id: string;
  sessionId: string;
  segmentId: string;
  speaker: string;
  start: number;
  end: number;
  text: string;
  fallacy: string;
  needsFactCheck: boolean;
  verdict: 'supported' | 'disputed' | 'likely_false' | 'uncertain' | 'not_checked';
  confidence?: number;
  reasoning?: string;
  sources?: FactSource[];
}

/**
 * Fact-check a single claim
 */
export async function factCheckClaim(claimText: string): Promise<FactCheckResult> {
  const response = await fetch(`${API_BASE_URL}/api/fact-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ claimText }),
  });

  if (!response.ok) {
    throw new Error(`Fact-check failed: ${response.statusText}`);
  }

  return response.json();
}

export interface ClaudeClaimPayload {
  id?: string;
  segmentId?: string;
  speaker?: string;
  start?: number;
  end?: number;
  text: string;
  fallacy?: string;
  needsFactCheck?: boolean;
}

/**
 * Fact-check a batch of Claude-extracted claims
 */
export async function factCheckClaudeClaims(
  claims: ClaudeClaimPayload[],
  sessionId?: string
): Promise<Claim[]> {
  const response = await fetch(`${API_BASE_URL}/api/claims/fact-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sessionId,
      claims
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Batch fact-check failed: ${errorText || response.statusText}`);
  }

  const data = await response.json();
  return data.results;
}

/**
 * Analyze a transcript segment to extract and fact-check claims
 */
export async function analyzeSegment(segment: Segment): Promise<Claim[]> {
  const response = await fetch(`${API_BASE_URL}/api/analyze-segment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(segment),
  });

  if (!response.ok) {
    throw new Error(`Segment analysis failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Start a new live debate session
 */
export async function startLiveSession(speakers?: Record<string, string>): Promise<{
  sessionId: string;
  speakers: Record<string, string>;
}> {
  const response = await fetch(`${API_BASE_URL}/api/live/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(speakers ? { speakers } : {}),
  });

  if (!response.ok) {
    throw new Error(`Failed to start session: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get the current state of a live session
 */
export async function getLiveSessionState(sessionId: string): Promise<{
  sessionId: string;
  startedAt: number;
  speakers: Record<string, string>;
  segments: Segment[];
  claims: Claim[];
}> {
  const response = await fetch(
    `${API_BASE_URL}/api/live/state?sessionId=${encodeURIComponent(sessionId)}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get session state: ${response.statusText}`);
  }

  return response.json();
}

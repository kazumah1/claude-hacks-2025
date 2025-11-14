export type SpeakerId = string; // e.g. "spk_0", "spk_1"

export interface SpeakerMap {
  [id: SpeakerId]: string; // { "spk_0": "Speaker A", "spk_1": "Speaker B" }
}

export interface Segment {
  id: string;
  sessionId: string;     // live session id or clipId
  speaker: SpeakerId;
  start: number;         // seconds from start
  end: number;
  text: string;
}

export type FallacyType =
  | "none"
  | "strawman"
  | "ad_hominem"
  | "appeal_to_emotion"
  | "false_dilemma"
  | "hasty_generalization"
  | "slippery_slope"
  | "other";

export type VerdictType =
  | "not_checked"
  | "supported"
  | "disputed"
  | "likely_false"
  | "uncertain";

export interface FactSource {
  title: string;
  url: string;
  snippet: string;
}

export interface Claim {
  id: string;
  sessionId: string;
  segmentId: string;
  speaker: SpeakerId;
  start: number;
  end: number;
  text: string;              // the claim text, not full segment
  fallacy: FallacyType;
  needsFactCheck: boolean;

  verdict: VerdictType;      // from fact-check API
  confidence?: number;       // 0–1 if available
  reasoning?: string;        // short summary
  sources?: FactSource[];    // supporting/contradicting sources
}

export interface ClipAnalysis {
  clipId: string;
  title: string;
  videoUrl: string;
  speakers: SpeakerMap;
  segments: Segment[];
  claims: Claim[];
}

export interface LiveSessionState {
  sessionId: string;
  startedAt: number;
  speakers: SpeakerMap;
  segments: Segment[];
  claims: Claim[];
}

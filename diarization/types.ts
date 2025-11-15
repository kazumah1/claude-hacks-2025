export interface TranscriptWord {
  text: string;
  type: string;
  start: number;
  end: number;
  speaker_id: string;
  characters?: {
    text: string;
    start: number;
    end: number;
  }[];
}

export interface TranscriptResponse {
  language_code: string;
  language_probability: number;
  text: string;
  words: TranscriptWord[];
}
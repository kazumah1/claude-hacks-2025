"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Segment } from "../types";

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_SECONDS = 6;
const MERGE_GAP_SECONDS = 1.25;

interface ElevenLabsWord {
  text: string;
  type: string;
  start: number;
  end: number;
  speaker_id?: string;
}

interface ElevenLabsResponse {
  text?: string;
  words?: ElevenLabsWord[];
}

interface UseTranscriptionProps {
  stream: MediaStream | null;
  sessionId: string;
  enabled: boolean;
}

interface UseTranscriptionReturn {
  segments: Segment[];
  isConnected: boolean;
  error: string | null;
}

const TRANSCRIPTION_PROVIDER = (
  process.env.NEXT_PUBLIC_TRANSCRIPTION_PROVIDER ?? "elevenlabs"
).toLowerCase();
const USE_ELEVENLABS = TRANSCRIPTION_PROVIDER !== "deepgram";

const normalizeSpeakerId = (speakerId?: string): string => {
  if (!speakerId) return "spk_0";
  const match = speakerId.match(/(\d+)/);
  if (match) {
    return `spk_${match[1]}`;
  }
  if (speakerId.startsWith("speaker_")) {
    return speakerId.replace("speaker_", "spk_");
  }
  return speakerId;
};

const mergeSegments = (current: Segment[], incoming: Segment[]): Segment[] => {
  if (!incoming.length) return current;
  const merged = [...current];

  for (const segment of incoming) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      previous.sessionId === segment.sessionId &&
      previous.speaker === segment.speaker &&
      segment.start - previous.end <= MERGE_GAP_SECONDS
    ) {
      merged[merged.length - 1] = {
        ...previous,
        end: Math.max(previous.end, segment.end),
        text: `${previous.text} ${segment.text}`.replace(/\s+/g, " ").trim()
      };
    } else {
      merged.push(segment);
    }
  }

  return merged;
};

const convertWordsToSegments = (
  words: ElevenLabsWord[] = [],
  sessionId: string,
  chunkStart: number,
  chunkId: number
): Segment[] => {
  const segments: Segment[] = [];
  let currentSpeaker: string | null = null;
  let currentText = "";
  let segmentStart = 0;
  let lastWordEnd = 0;

  const pushSegment = () => {
    const trimmed = currentText.trim();
    if (!trimmed || currentSpeaker === null) return;

    segments.push({
      id: `seg_${sessionId}_${chunkId}_${segmentStart}_${Math.random().toString(36).slice(2, 8)}`,
      sessionId,
      speaker: currentSpeaker,
      start: chunkStart + segmentStart,
      end: chunkStart + lastWordEnd,
      text: trimmed
    });
  };

  for (const word of words) {
    if (word.type === "word") {
      const normalizedSpeaker = normalizeSpeakerId(word.speaker_id);
      const start = Number.isFinite(word.start) ? word.start : lastWordEnd;
      const end = Number.isFinite(word.end) ? word.end : start;

      if (currentSpeaker === null) {
        currentSpeaker = normalizedSpeaker;
        currentText = word.text ?? "";
        segmentStart = start;
      } else if (normalizedSpeaker !== currentSpeaker) {
        pushSegment();
        currentSpeaker = normalizedSpeaker;
        currentText = word.text ?? "";
        segmentStart = start;
      } else {
        currentText += word.text ?? "";
      }

      lastWordEnd = Math.max(end, start);
    } else if (word.type === "spacing") {
      currentText += " ";
    }
  }

  pushSegment();
  return segments;
};

const downsampleBuffer = (
  buffer: Float32Array,
  inputSampleRate: number,
  outputSampleRate: number
): Float32Array => {
  if (outputSampleRate === inputSampleRate) {
    return buffer;
  }

  if (outputSampleRate > inputSampleRate) {
    return buffer;
  }

  const sampleRateRatio = inputSampleRate / outputSampleRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;

    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }

    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
};

const combineFloat32Arrays = (chunks: Float32Array[], totalLength: number): Float32Array => {
  if (chunks.length === 1) {
    return chunks[0];
  }

  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.length;
  }
  return combined;
};

const writeString = (view: DataView, offset: number, str: string) => {
  for (let i = 0; i < str.length; i += 1) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
};

const createWavBlob = (samples: Float32Array, sampleRate: number): Blob => {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    let sample = samples[i];
    sample = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
};

function useElevenLabsTranscription({
  stream,
  sessionId,
  enabled
}: UseTranscriptionProps): UseTranscriptionReturn {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const chunkBuffersRef = useRef<Float32Array[]>([]);
  const chunkSamplesRef = useRef(0);
  const chunkStartOffsetRef = useRef(0);
  const chunkSequenceRef = useRef(0);
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());
  const runIdRef = useRef(0);

  const resetChunkState = useCallback(() => {
    chunkBuffersRef.current = [];
    chunkSamplesRef.current = 0;
    chunkStartOffsetRef.current = 0;
    chunkSequenceRef.current = 0;
  }, []);

  const processChunk = useCallback(
    async (
      samples: Float32Array,
      chunkStart: number,
      chunkId: number,
      runId: number
    ) => {
      try {
        const wavBlob = createWavBlob(samples, TARGET_SAMPLE_RATE);
        const file = new File(
          [wavBlob],
          `chunk_${sessionId}_${chunkId}.wav`,
          { type: "audio/wav" }
        );
        const formData = new FormData();
        formData.append("audio", file);
        formData.append("model_id", "scribe_v1");

        const response = await fetch("/api/elevenlabs/transcribe", {
          method: "POST",
          body: formData
        });

        if (!response.ok) {
          const details = await response.text();
          throw new Error(details || "ElevenLabs transcription failed");
        }

        const result: ElevenLabsResponse = await response.json();
        if (runIdRef.current !== runId) {
          return;
        }

        const chunkSegments = convertWordsToSegments(
          result.words ?? [],
          sessionId,
          chunkStart,
          chunkId
        );

        if (chunkSegments.length) {
          setSegments((prev) => mergeSegments(prev, chunkSegments));
        }
        setError(null);
      } catch (err) {
        console.error("Failed to transcribe ElevenLabs chunk:", err);
        if (runIdRef.current === runId) {
          setError(
            err instanceof Error ? err.message : "Failed to transcribe audio chunk"
          );
        }
      }
    },
    [sessionId]
  );

  const enqueueChunkUpload = useCallback(
    (samples: Float32Array, chunkStart: number, chunkId: number, runId: number) => {
      uploadQueueRef.current = uploadQueueRef.current
        .catch(() => undefined)
        .then(() => processChunk(samples, chunkStart, chunkId, runId));
    },
    [processChunk]
  );

  const flushChunk = useCallback(
    (force: boolean, runId: number) => {
      const totalSamples = chunkSamplesRef.current;
      const targetSamples = TARGET_SAMPLE_RATE * CHUNK_DURATION_SECONDS;

      if (!totalSamples) {
        return;
      }

      if (!force && totalSamples < targetSamples) {
        return;
      }

      const chunkStart = chunkStartOffsetRef.current;
      const combined = combineFloat32Arrays(chunkBuffersRef.current, totalSamples);
      const chunkId = chunkSequenceRef.current++;

      chunkBuffersRef.current = [];
      chunkSamplesRef.current = 0;
      chunkStartOffsetRef.current += totalSamples / TARGET_SAMPLE_RATE;

      enqueueChunkUpload(combined, chunkStart, chunkId, runId);
    },
    [enqueueChunkUpload]
  );

  const cleanup = useCallback(
    (runId?: number) => {
      const currentRunId = runId ?? runIdRef.current;
      try {
        flushChunk(true, currentRunId);
      } catch (err) {
        console.error("Failed to flush chunk during cleanup:", err);
      }

      resetChunkState();

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }

      if (gainNodeRef.current) {
        gainNodeRef.current.disconnect();
        gainNodeRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
        audioContextRef.current = null;
      }

      setIsConnected(false);
    },
    [flushChunk, resetChunkState]
  );

  useEffect(() => {
    if (!enabled || !stream) {
      cleanup();
      return;
    }

    const runId = ++runIdRef.current;
    resetChunkState();
    setSegments([]);
    setError(null);

    let cancelled = false;

    const startAudioPipeline = async () => {
      try {
        if (typeof window === "undefined" || typeof AudioContext === "undefined") {
          throw new Error("AudioContext is not supported in this environment");
        }

        const audioContext = audioContextRef.current ?? new AudioContext();
        audioContextRef.current = audioContext;

        if (audioContext.state === "suspended") {
          await audioContext.resume();
        }

        const audioTracks = stream.getAudioTracks();
        if (!audioTracks.length) {
          throw new Error("No audio track available for transcription");
        }

        const audioStream = new MediaStream(audioTracks);
        const sourceNode = audioContext.createMediaStreamSource(audioStream);
        const processorNode = audioContext.createScriptProcessor(4096, 1, 1);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0;

        processorNode.onaudioprocess = (event) => {
          if (runIdRef.current !== runId) return;
          const inputBuffer = event.inputBuffer.getChannelData(0);
          const downsampled = downsampleBuffer(
            inputBuffer,
            audioContext.sampleRate,
            TARGET_SAMPLE_RATE
          );
          if (!downsampled.length) return;

          chunkBuffersRef.current.push(downsampled);
          chunkSamplesRef.current += downsampled.length;

          if (chunkSamplesRef.current >= TARGET_SAMPLE_RATE * CHUNK_DURATION_SECONDS) {
            flushChunk(false, runId);
          }
        };

        sourceNode.connect(processorNode);
        processorNode.connect(gainNode);
        gainNode.connect(audioContext.destination);

        sourceRef.current = sourceNode;
        processorRef.current = processorNode;
        gainNodeRef.current = gainNode;

        if (!cancelled) {
          setIsConnected(true);
        }
      } catch (err) {
        console.error("Failed to initialize ElevenLabs transcription:", err);
        if (!cancelled && runIdRef.current === runId) {
          setError(
            err instanceof Error ? err.message : "Failed to initialize transcription"
          );
          setIsConnected(false);
        }
      }
    };

    startAudioPipeline();

    return () => {
      cancelled = true;
      cleanup(runId);
    };
  }, [cleanup, enabled, flushChunk, resetChunkState, stream]);

  return {
    segments,
    isConnected,
    error
  };
}

function useDeepgramStreamingTranscription({
  stream,
  sessionId,
  enabled
}: UseTranscriptionProps): UseTranscriptionReturn {
  const [segments, setSegments] = useState<Segment[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const cleanup = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.error("Error stopping MediaRecorder:", err);
      }
      mediaRecorderRef.current = null;
    }

    if (socketRef.current) {
      try {
        if (socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify({ type: "CloseStream" }));
        }
        socketRef.current.close();
      } catch (err) {
        console.error("Error closing Deepgram socket:", err);
      }
      socketRef.current = null;
    }

    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!enabled || !stream) {
      cleanup();
      return;
    }

    setSegments([]);
    setError(null);

    let mounted = true;
    const setupDeepgram = async () => {
      try {
        const tokenResponse = await fetch("/api/deepgram/token");
        if (!tokenResponse.ok) {
          throw new Error("Failed to fetch Deepgram token");
        }

        const { key } = await tokenResponse.json();
        if (!key) {
          throw new Error("Deepgram token missing from response");
        }

        const getSupportedMimeType = () => {
          const types = [
            "audio/webm;codecs=opus",
            "audio/ogg;codecs=opus",
            "audio/webm",
            "audio/mp4"
          ];

          for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
              return type;
            }
          }
          return "";
        };

        const mimeType = getSupportedMimeType();
        const wsUrl = new URL("wss://api.deepgram.com/v1/listen");
        wsUrl.searchParams.set("diarize", "true");

        const ws = new WebSocket(wsUrl.toString(), ["token", key as string]);
        socketRef.current = ws;

        const readyStateLabel = () => {
          switch (ws.readyState) {
            case WebSocket.CONNECTING:
              return "CONNECTING";
            case WebSocket.OPEN:
              return "OPEN";
            case WebSocket.CLOSING:
              return "CLOSING";
            case WebSocket.CLOSED:
              return "CLOSED";
            default:
              return `${ws.readyState}`;
          }
        };

        const startMediaRecorder = () => {
          if (!stream) {
            throw new Error("No media stream available");
          }
          if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
            throw new Error("MediaRecorder is not supported in this environment");
          }

          const audioTracks = stream.getAudioTracks();
          if (!audioTracks.length) {
            throw new Error("No microphone audio track found");
          }

          const audioStream = new MediaStream(audioTracks);
          let mediaRecorder: MediaRecorder;
          try {
            mediaRecorder = mimeType
              ? new MediaRecorder(audioStream, { mimeType })
              : new MediaRecorder(audioStream);
          } catch (err) {
            console.warn("Falling back to default MediaRecorder mimeType:", err);
            mediaRecorder = new MediaRecorder(audioStream);
          }

          mediaRecorderRef.current = mediaRecorder;

          mediaRecorder.ondataavailable = (event) => {
            const socket = socketRef.current;
            if (!socket || socket.readyState !== WebSocket.OPEN) return;
            if (event.data.size === 0) return;
            try {
              socket.send(event.data);
            } catch (err) {
              console.error("Error sending audio data:", err);
            }
          };

          mediaRecorder.onerror = (event) => {
            console.error("MediaRecorder error:", event);
            setError("Audio recording error");
          };

          mediaRecorder.onstart = () => {
            console.log("MediaRecorder started");
          };

          mediaRecorder.onstop = () => {
            console.log("MediaRecorder stopped");
          };

          try {
            mediaRecorder.start(250);
          } catch (err) {
            console.error("MediaRecorder failed to start:", err);
            throw err;
          }
        };

        ws.onopen = () => {
          if (!mounted) return;
          setIsConnected(true);
          setError(null);
          try {
            startMediaRecorder();
          } catch (err) {
            console.error("Failed to start MediaRecorder:", err);
            setError(
              err instanceof Error ? err.message : "Failed to start audio recording"
            );
          }
        };

        ws.onmessage = (event) => {
          if (!mounted) return;

          try {
            const data = JSON.parse(event.data);
            if (data.type === "Results" && data.channel?.alternatives?.length) {
              const transcript = data.channel.alternatives[0];
              const text = transcript?.transcript?.trim();
              const isFinal = data.is_final ?? transcript?.is_final ?? true;
              if (!text || !isFinal) return;

              const words = transcript.words || [];
              const start = words[0]?.start ?? 0;
              const end = words[words.length - 1]?.end ?? start + 1;
              const speaker =
                words[0]?.speaker !== undefined ? `spk_${words[0].speaker}` : "spk_0";

              const segment: Segment = {
                id: `seg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sessionId,
                speaker,
                start,
                end,
                text
              };

              setSegments((prev) => [...prev, segment]);
            } else if (data.type === "Error" || data.type === "FatalError") {
              const desc = data.description || data.message || "Unknown error";
              setError(`Transcription error: ${desc}`);
            }
          } catch (err) {
            console.error("Error parsing Deepgram message:", err);
          }
        };

        ws.onerror = () => {
          if (!mounted) return;
          const msg = `WebSocket connection error (Ready State: ${readyStateLabel()}, URL: ${ws.url})`;
          setError(`Transcription error: ${msg}`);
        };

        ws.onclose = (event) => {
          if (!mounted) return;
          setIsConnected(false);
          if (!event.wasClean) {
            setError(
              `Transcription error: Connection closed (${event.code}) ${event.reason || ""}`.trim()
            );
          }
        };
      } catch (err) {
        if (!mounted) return;
        console.error("Failed to set up Deepgram:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize transcription");
      }
    };

    setupDeepgram();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [cleanup, enabled, sessionId, stream]);

  return {
    segments,
    isConnected,
    error
  };
}

const useTranscriptionImpl = USE_ELEVENLABS
  ? useElevenLabsTranscription
  : useDeepgramStreamingTranscription;

export function useDeepgramTranscription(
  props: UseTranscriptionProps
): UseTranscriptionReturn {
  return useTranscriptionImpl(props);
}

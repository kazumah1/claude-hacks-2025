"use client";

import { useEffect, useRef, useState } from "react";

type VideoCaptureElement = HTMLVideoElement & {
  mozCaptureStream?: () => MediaStream;
};

interface VideoLayerProps {
  mode: "live" | "replay";
  videoUrl?: string; // for replay mode
  onTimeUpdate?: (time: number) => void; // for replay mode
  onStreamReady?: (stream: MediaStream) => void; // callback when a MediaStream is available
}

export default function VideoLayer({ mode, videoUrl, onTimeUpdate, onStreamReady }: VideoLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "live") return;

    let activeStream: MediaStream | null = null;
    let cancelled = false;

    const getMedia = async () => {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: "user"
          },
          audio: true
        });

        if (cancelled) {
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        activeStream = mediaStream;
        setStream(mediaStream);

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        onStreamReady?.(mediaStream);
      } catch (err) {
        console.error("Error accessing media devices:", err);
        setError("Failed to access camera/microphone. Please grant permissions.");
      }
    };

    getMedia();

    return () => {
      cancelled = true;
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [mode, onStreamReady]);

  // Update stream when videoRef is ready
  useEffect(() => {
    if (mode === "live" && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, mode]);

  useEffect(() => {
    if (mode !== "replay" || !videoUrl || !onStreamReady) return;

    const videoElement = videoRef.current;
    if (!videoElement) return;

    let disposed = false;
    let provided = false;

    const provideStream = () => {
      if (!videoRef.current || provided || disposed) return;
      const captureSource = videoRef.current as VideoCaptureElement;

      const capture =
        typeof captureSource.captureStream === "function"
          ? captureSource.captureStream()
          : typeof captureSource.mozCaptureStream === "function"
            ? captureSource.mozCaptureStream()
            : null;

      if (!capture) {
        console.warn("captureStream is not supported in this browser.");
        return;
      }

      if (capture.getAudioTracks().length === 0) {
        // Audio track might not be available until playback starts
        return;
      }

      provided = true;
      onStreamReady(capture);
    };

    const handleLoaded = () => {
      provideStream();
    };

    const handlePlay = () => {
      provideStream();
    };

    videoElement.addEventListener("loadeddata", handleLoaded);
    videoElement.addEventListener("play", handlePlay);

    // Attempt immediately in case metadata is already ready
    if (videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      provideStream();
    }

    return () => {
      disposed = true;
      videoElement.removeEventListener("loadeddata", handleLoaded);
      videoElement.removeEventListener("play", handlePlay);
    };
  }, [mode, videoUrl, onStreamReady]);

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-background">
        <div className="text-center px-8">
          <p className="text-primary text-lg mb-4">{error}</p>
          <p className="text-foreground/60 text-sm">
            Please check your browser settings and refresh the page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={mode === "live"} // mute live to avoid feedback
      controls={mode === "replay"}
      onTimeUpdate={handleTimeUpdate}
      className="absolute inset-0 w-full h-full object-cover"
      style={mode === "live" ? { transform: "scaleX(-1)" } : undefined}
      src={mode === "replay" ? videoUrl : undefined}
    />
  );
}

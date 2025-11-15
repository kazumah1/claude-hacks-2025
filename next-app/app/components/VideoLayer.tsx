"use client";

import { useEffect, useRef, useState } from "react";

interface VideoLayerProps {
  mode: "live" | "replay";
  videoUrl?: string; // for replay mode
  onTimeUpdate?: (time: number) => void; // for replay mode
  onStreamReady?: (stream: MediaStream) => void; // for live mode - callback when stream is ready
}

export default function VideoLayer({ mode, videoUrl, onTimeUpdate, onStreamReady }: VideoLayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === "live") {
      // Request webcam and microphone access
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

          setStream(mediaStream);

          if (videoRef.current) {
            videoRef.current.srcObject = mediaStream;
          }

          // Notify parent component that stream is ready
          if (onStreamReady) {
            onStreamReady(mediaStream);
          }
        } catch (err) {
          console.error("Error accessing media devices:", err);
          setError("Failed to access camera/microphone. Please grant permissions.");
        }
      };

      getMedia();

      // Cleanup function to stop stream when component unmounts
      return () => {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }
      };
    }
  }, [mode]);

  // Update stream when videoRef is ready
  useEffect(() => {
    if (mode === "live" && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, mode]);

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

import React, { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";

interface ScanResult {
  type: string;
  data: string;
}

interface VideoFeedProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  obsUrl: string;
  isBroadcasting: boolean;
  cameraId?: string;
  facingMode?: "user" | "environment";
  streamRef: React.MutableRefObject<MediaStream | null>;
  availableCameras: MediaDeviceInfo[];
}

const VideoFeed: React.FC<VideoFeedProps> = ({
  videoRef,
  obsUrl,
  isBroadcasting,
  cameraId,
  facingMode,
  streamRef,
  availableCameras,
}) => {
  const [error, setError] = useState<string>("");
  const [isPortrait, setIsPortrait] = useState<boolean>(
    window.matchMedia("(orientation: portrait)").matches
  );
  const scannerContainerRef = useRef<HTMLDivElement>(null);

  // Initialize camera preview with orientation-based constraints
  useEffect(() => {
    const startPreview = async () => {
      if (!videoRef.current) return;

      try {
        setError("");
        const constraints: MediaStreamConstraints = {
          video: {
            ...(cameraId ? { deviceId: { exact: cameraId } } : {}),
            ...(facingMode ? { facingMode: { exact: facingMode } } : {}),
            width: { ideal: isPortrait ? 720 : 1920 },
            height: { ideal: isPortrait ? 1280 : 1080 },
            aspectRatio: { ideal: isPortrait ? 9 / 16 : 16 / 9 },
            frameRate: { ideal: 24 },
          },
          audio: false,
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch((err) => {
          console.error("Error playing video preview:", err);
          setError("Failed to play camera preview: " + err.message);
        });
      } catch (err: any) {
        console.error("Error accessing camera:", err);
        if (err.name === "OverconstrainedError") {
          setError("Camera does not support requested resolution or aspect ratio.");
        } else if (err.name === "NotAllowedError") {
          setError("Camera access denied. Please grant permission.");
        } else {
          setError("Cannot access camera: " + err.message);
        }
      }
    };

    if (isBroadcasting) {
      startPreview();
    }

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [cameraId, facingMode, videoRef, streamRef, isPortrait, isBroadcasting]);

  // Handle orientation changes
  useEffect(() => {
    const handleOrientationChange = () => {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      setIsPortrait(portrait);
    };

    window.addEventListener("orientationchange", handleOrientationChange);
    window.matchMedia("(orientation: portrait)").addEventListener("change", handleOrientationChange);

    return () => {
      window.removeEventListener("orientationchange", handleOrientationChange);
      window.matchMedia("(orientation: portrait)").removeEventListener("change", handleOrientationChange);
    };
  }, []);

  const copyToClipboard = () => {
    if (obsUrl) {
      navigator.clipboard.writeText(obsUrl).then(() => {
        alert("OBS URL copied to clipboard!");
      }).catch((err) => {
        console.error("Failed to copy URL:", err);
        alert("Failed to copy URL. Please copy it manually.");
      });
    }
  };

  return (
    <div className="w-full max-w-md relative">
      <div className={`bg-black rounded-lg overflow-hidden ${isPortrait ? "aspect-[9/16]" : "aspect-[16/9]"} relative`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
        <div id="scanner-container" ref={scannerContainerRef} className="hidden" />
        {obsUrl && (
          <motion.div
            className="absolute top-2 right-2 bg-gray-800 bg-opacity-90 px-2 py-1 rounded-full text-xs flex items-center space-x-2 shadow"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <span className="truncate max-w-[120px]">{obsUrl}</span>
            <button
              onClick={copyToClipboard}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-0.5 text-xs"
              title="Copy"
            >
              Copy
            </button>
          </motion.div>
        )}
      </div>

      {error && (
        <motion.p
          className="mt-3 text-red-400 text-sm text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};

export default VideoFeed;
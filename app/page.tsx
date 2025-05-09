

"use client";
import React, { useRef, useState } from "react";
import { useAuth } from "@/app/broadcaster/hooks/useAuth";
import { useCamera } from "@/app/broadcaster/hooks/useCamera";
import { useBroadcastSocket } from "@/app/broadcaster/hooks/useBroadcastSocket";
import VideoFeed from "@/app/broadcaster/components/VideoFeed";
import SettingsPanel from "@/app/broadcaster/components/SettingsPanel";
import BroadcastStatus from "@/app/broadcaster/components/BroadcastStatus";

const BroadcastPage: React.FC = () => {
  const { authState, setAuthState, handleLogin, handleLogout } = useAuth();
  const { cameraId, setCameraId, availableCameras } = useCamera();
  const [broadcastState, setBroadcastState] = useState<{
    isBroadcasting: boolean;
    viewerCount: number;
    broadcasterName: string;
    isStarting: boolean;
    isPaused: boolean;
    error: string;
  }>({
    isBroadcasting: false,
    viewerCount: 0,
    broadcasterName: "",
    isStarting: false,
    isPaused: false,
    error: "",
  });
  const [obsUrl, setObsUrl] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());

  const { socketRef } = useBroadcastSocket(authState, streamRef, peerConnections, setBroadcastState);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white p-4">
      <SettingsPanel
        authState={authState}
        setAuthState={setAuthState}
        handleLogin={handleLogin}
        handleLogout={handleLogout}
        cameraId={cameraId}
        setCameraId={setCameraId}
        availableCameras={availableCameras}
        broadcastState={broadcastState}
        setBroadcastState={setBroadcastState}
        streamRef={streamRef}
        videoRef={videoRef}
        socketRef={socketRef}
        obsUrl={obsUrl}
        setObsUrl={setObsUrl}
      />
      <VideoFeed
        videoRef={videoRef}
        obsUrl={obsUrl}
        isBroadcasting={broadcastState.isBroadcasting}
        cameraId={cameraId}
        streamRef={streamRef}
        availableCameras={availableCameras}
      />
      <BroadcastStatus broadcastState={broadcastState} />
    </div>
  );
};

export default BroadcastPage;

 
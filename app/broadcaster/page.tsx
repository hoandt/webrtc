"use client";
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const Broadcast: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const socketRef = useRef<any>(null);
  const peerConnections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [broadcastToken, setBroadcastToken] = useState<string>("");
  const [viewerCount, setViewerCount] = useState<number>(0);
  const [error, setError] = useState<string>("");
  const [broadcasterName, setBroadcasterName] = useState<string>("");
  const [isStarting, setIsStarting] = useState<boolean>(false);

  const startStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 15 },
        },
        audio: false,
      });
      console.log("getUserMedia stream:", stream);
      console.log("Stream tracks:", stream.getTracks());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch((err) => console.error("Error playing broadcaster video:", err));
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError("Cannot access camera: " + err.message);
      setIsStarting(false);
    }
  };

  const handleStartBroadcast = () => {
    if (isStarting) return;
    setIsStarting(true);
    setError("");
    socketRef.current.emit(
      "set_role",
      { role: "broadcaster", name: broadcasterName || `Broadcaster ${socketRef.current.id.slice(0, 8)}` },
      (response: any) => {
        console.log("set_role response:", response);
        if (response.status === "success") {
          setBroadcastToken(response.broadcastToken);
          startStream();
        } else {
          setError("Failed to set broadcaster role: " + response.message);
          setIsStarting(false);
        }
      }
    );
  };

  useEffect(() => {
    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.host}`;
    socketRef.current = io(serverUrl, {
      path: "/api/socket",
      reconnection: false,
      secure: serverUrl.startsWith("https"),
    });

    socketRef.current.on("connect", () => {
      console.log("Broadcaster socket connected:", socketRef.current.id);
    });

    socketRef.current.on("viewer_ready", async ({ viewerId }: { viewerId: string }) => {
      console.log("viewer_ready for viewer:", viewerId);
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      });
      peerConnections.current.set(viewerId, pc);

      console.log("Broadcaster tracks:", streamRef.current?.getTracks());
      streamRef.current?.getTracks().forEach((track) => {
        console.log("Adding track:", track, "enabled:", track.enabled);
        pc.addTrack(track, streamRef.current!);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Broadcaster sending ICE candidate for viewer:", viewerId);
          socketRef.current.emit("candidate", { candidate: event.candidate, viewerId });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`Peer connection state for viewer ${viewerId}:`, pc.connectionState);
        if (pc.connectionState === "failed") {
          peerConnections.current.delete(viewerId);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        console.log("Broadcaster sending offer for viewer:", viewerId);
        socketRef.current.emit("offer", { offer, viewerId });
      } catch (err: any) {
        console.error("Error creating offer:", err);
        setError("Error creating offer: " + err.message);
      }
    });

    socketRef.current.on("answer", async ({ answer, viewerId }: { answer: RTCSessionDescriptionInit; viewerId: string }) => {
      const pc = peerConnections.current.get(viewerId);
      if (pc) {
        try {
          console.log("Broadcaster received answer from viewer:", viewerId);
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error("Error setting remote description:", err);
        }
      }
    });

    socketRef.current.on("candidate", async ({ candidate, viewerId }: { candidate: RTCIceCandidateInit; viewerId: string }) => {
      const pc = peerConnections.current.get(viewerId);
      if (pc) {
        try {
          console.log("Broadcaster received ICE candidate from viewer:", viewerId);
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      }
    });

    socketRef.current.on("viewer_count", ({ viewerCount }: { viewerCount: number }) => {
      console.log("Viewer count updated:", viewerCount);
      setViewerCount(viewerCount);
    });

    socketRef.current.on("connect_error", (err: any) => {
      console.error("Socket connect error:", err);
      setError("Failed to connect to server");
      setIsStarting(false);
    });

    socketRef.current.on("disconnect", () => {
      console.log("Socket disconnected");
      setError("Disconnected from server");
      setIsStarting(false);
    });

    return () => {
      socketRef.current.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnections.current.forEach((pc) => pc.close());
    };
  }, []);

  const handleRevokeToken = () => {
    socketRef.current.emit("revoke_token", (response: any) => {
      if (response.status === "success") {
        setBroadcastToken("");
        setViewerCount(0);
        streamRef.current?.getTracks().forEach((track) => track.stop());
        peerConnections.current.forEach((pc) => pc.close());
        peerConnections.current.clear();
        setIsStarting(false);
      } else {
        setError("Failed to revoke token: " + response.message);
      }
    });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h1 className="text-xl font-bold mb-4">Broadcaster</h1>
      {!broadcastToken && (
        <div className="w-full max-w-sm mb-4">
          <label className="block text-sm mb-1">Broadcaster Name</label>
          <input
            type="text"
            value={broadcasterName}
            onChange={(e) => setBroadcasterName(e.target.value)}
            placeholder="Enter a name (e.g., Studio1)"
            className="w-full px-3 py-2 bg-gray-800 rounded-lg text-white mb-2"
            disabled={isStarting}
          />
          <button
            onClick={handleStartBroadcast}
            disabled={isStarting}
            className={`w-full px-4 py-2 rounded-lg ${isStarting ? "bg-gray-500" : "bg-blue-500 hover:bg-blue-600"}`}
          >
            {isStarting ? "Starting..." : "Start Broadcast"}
          </button>
        </div>
      )}
      <video ref={videoRef} autoPlay playsInline muted className="w-full max-w-sm rounded-lg shadow-md" />
      {error && <p className="mt-4 text-red-500">{error}</p>}
      {broadcastToken && (
        <>
          <p className="mt-4">Broadcast Token: <span className="font-mono">{broadcastToken}</span></p>
          <p className="mt-2">Viewers: {viewerCount}</p>
          <button
            onClick={handleRevokeToken}
            className="mt-4 px-4 py-2 bg-red-500 rounded-lg hover:bg-red-600"
          >
            Stop Broadcast
          </button>
        </>
      )}
    </div>
  );
};

export default Broadcast;
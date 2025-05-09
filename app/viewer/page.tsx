"use client";
import React, { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const Viewer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState<string>("Connecting...");
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [isOBS, setIsOBS] = useState(false);
  const [isPortrait, setIsPortrait] = useState<boolean>(
    typeof window !== "undefined" && window.matchMedia("(orientation: portrait)").matches
  );

  const connectToBroadcaster = (socket: Socket, phone: string) => {
    setStatus("Connecting to broadcaster...");
    socket.emit("set_role", { role: "viewer", phone }, (roleResponse: any) => {
      if (roleResponse.status === "success") {
        setStatus("Waiting for stream...");
        socket.emit("viewer_ready", phone, (readyResponse: any) => {
          if (readyResponse.status !== "success") {
            setStatus("Failed to initialize stream: " + readyResponse.message);
          }
        });
      } else {
        setStatus("Connection failed: " + roleResponse.message);
      }
    });
  };

  useEffect(() => {
    setIsOBS(typeof navigator !== "undefined");

    // Handle orientation changes
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

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const phone = urlParams.get("phone") || "";

    if (!phone) {
      setStatus("Phone parameter is required in URL");
      return;
    }

    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      `${window.location.protocol}//${window.location.host}`;
    const socketInstance = io(serverUrl, {
      path: "/api/socket",
      reconnection: false,
      secure: serverUrl.startsWith("https"),
    });
    socketRef.current = socketInstance;

    socketInstance.on("connect", () => {
      setStatus("Finding broadcaster...");
      socketInstance.emit("check_broadcaster", phone, (checkResponse: any) => {
        if (checkResponse.exists) {
          connectToBroadcaster(socketInstance, phone);
        } else {
          setStatus(`No active broadcaster found for phone ${phone}`);
        }
      });
    });

    socketInstance.on("offer", async (offer: RTCSessionDescriptionInit) => {
      peerConnectionRef.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
        ],
      });

      peerConnectionRef.current.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.muted = true;
          videoRef.current.play().then(() => {
            setStatus("Connected");
            setIsPaused(false);
          }).catch((err) => {
            console.error("Error playing video:", err);
            setStatus("Error playing video: " + err.message);
          });
        } else {
          setStatus("No video stream received");
        }
      };

      peerConnectionRef.current.onicecandidate = (event) => {
        if (event.candidate) {
          socketInstance.emit("candidate", { candidate: event.candidate });
        }
      };

      peerConnectionRef.current.onconnectionstatechange = () => {
        if (peerConnectionRef.current?.connectionState === "failed") {
          setStatus("WebRTC connection failed");
          peerConnectionRef.current?.close();
          peerConnectionRef.current = null;
        } else if (peerConnectionRef.current?.connectionState === "connected") {
          setStatus("Connected");
          setIsPaused(false);
        }
      };

      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnectionRef.current.createAnswer();
        await peerConnectionRef.current.setLocalDescription(answer);
        socketInstance.emit("answer", { answer });
      } catch (err: any) {
        console.error("Error handling offer:", err);
        setStatus("Error connecting to stream: " + err.message);
      }
    });

    socketInstance.on("candidate", async (candidate: RTCIceCandidateInit) => {
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      }
    });

    socketInstance.on("broadcaster_paused", () => {
      setIsPaused(true);
      if (videoRef.current) {
        videoRef.current.pause();
      }
      setStatus("Stream paused by broadcaster");
    });

    socketInstance.on("broadcaster_resumed", () => {
      setIsPaused(false);
      setStatus("Reconnecting to stream...");
      connectToBroadcaster(socketInstance, phone);
    });

    socketInstance.on("broadcaster_disconnected", () => {
      setStatus("Broadcaster disconnected");
      setIsPaused(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    });

    socketInstance.on("connect_error", (err) => {
      console.error("Socket connect error:", err);
      setStatus("Failed to connect to server");
    });

    socketInstance.on("disconnect", () => {
      setStatus("Disconnected from server");
    });

    return () => {
      socketInstance.disconnect();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black">
      <div
        className={`relative w-full max-w-3xl ${
          isPortrait ? "aspect-[9/16]" : "aspect-[16/9]"
        } bg-black rounded-lg overflow-hidden`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          onError={(e) => {
            console.error("Video element error:", e);
            setStatus("Video error: " + (e as any).message);
          }}
        />
        {isPaused && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <p className="text-white text-lg font-medium">Stream Paused</p>
          </div>
        )}
      </div>
      {!isOBS && (
        <p className="mt-4 text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
          {status}
        </p>
      )}
    </div>
  );
};

export default Viewer;
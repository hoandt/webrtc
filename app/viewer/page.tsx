"use client";
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

const Viewer: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [socket, setSocket] = useState<any>(null);
  const [token, setToken] = useState<string>("");
  const [status, setStatus] = useState<string>("Connecting...");
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const [renderKey, setRenderKey] = useState<number>(0);
  const [broadcasters, setBroadcasters] = useState<{ token: string; name: string }[]>([]);
  const [selectedBroadcaster, setSelectedBroadcaster] = useState<string>("");
  const isOBS = navigator.userAgent.includes("OBS");

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get("token") || "";

    const serverUrl = process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.host}`;
    const socketInstance = io(serverUrl, {
      path: "/api/socket",
      reconnection: false,
      secure: serverUrl.startsWith("https"),
    });
    setSocket(socketInstance);

    socketInstance.on("connect", () => {
      console.log("Viewer socket connected:", socketInstance.id);
      if (urlToken) {
        setToken(urlToken);
        connectToBroadcaster(socketInstance, urlToken);
      } else {
        socketInstance.emit("get_broadcasters", (response: any) => {
          console.log("get_broadcasters response:", response);
          if (response.status === "success" && response.broadcasters.length > 0) {
            setBroadcasters(response.broadcasters);
            const defaultToken = response.broadcasters[0].token;
            if (isOBS) {
              setToken(defaultToken);
              setSelectedBroadcaster(defaultToken);
              connectToBroadcaster(socketInstance, defaultToken);
            } else {
              setStatus("Select a broadcaster");
            }
          } else {
            setStatus("No active broadcasters found");
          }
        });
      }
    });

    socketInstance.on("offer", async (offer: RTCSessionDescriptionInit) => {
      console.log("Received offer:", offer);
      peerConnection.current = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:openrelay.metered.ca:80",
            username: "openrelayproject",
            credential: "openrelayproject",
          },
        ],
      });

      peerConnection.current.ontrack = (event) => {
        console.log("ontrack event:", event);
        console.log("Received streams:", event.streams);
        console.log("Received tracks:", event.streams[0]?.getTracks());
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          videoRef.current.muted = true;
          const attemptPlayback = (attempts = 3, delay = 500) => {
            videoRef.current!.play().then(() => {
              console.log("Video playback started");
              setStatus("Video playing");
            }).catch((err) => {
              console.error("Error playing video:", err);
              if (attempts > 1) {
                console.log(`Retrying playback (${attempts - 1} attempts left)`);
                setTimeout(() => attemptPlayback(attempts - 1, delay * 2), delay);
              } else {
                setStatus("Error playing video: " + err.message);
                setRenderKey((prev) => prev + 1);
              }
            });
          };
          attemptPlayback();
        } else {
          console.warn("No streams or video element available");
          setStatus("No video stream received");
        }
      };

      peerConnection.current.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("Sending ICE candidate:", event.candidate);
          socketInstance.emit("candidate", { candidate: event.candidate });
        }
      };

      peerConnection.current.onconnectionstatechange = () => {
        console.log("Connection state:", peerConnection.current?.connectionState);
        if (peerConnection.current?.connectionState === "failed") {
          setStatus("WebRTC connection failed");
          peerConnection.current?.close();
          peerConnection.current = null;
        } else if (peerConnection.current?.connectionState === "connected") {
          setStatus("WebRTC connected");
        }
      };

      try {
        await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.current.createAnswer();
        await peerConnection.current.setLocalDescription(answer);
        console.log("Sending answer:", answer);
        socketInstance.emit("answer", { answer });
      } catch (err: any) {
        console.error("Error handling offer:", err);
        setStatus("Error connecting to stream: " + err.message);
      }
    });

    socketInstance.on("candidate", async (candidate: RTCIceCandidateInit) => {
      if (peerConnection.current) {
        try {
          console.log("Received ICE candidate:", candidate);
          await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error("Error adding ICE candidate:", err);
        }
      }
    });

    socketInstance.on("broadcaster_disconnected", () => {
      console.log("Broadcaster disconnected");
      setStatus("Broadcaster disconnected");
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      socketInstance.emit("get_broadcasters", (response: any) => {
        if (response.status === "success" && response.broadcasters.length > 0) {
          setBroadcasters(response.broadcasters);
          if (isOBS) {
            const defaultToken = response.broadcasters[0].token;
            setToken(defaultToken);
            setSelectedBroadcaster(defaultToken);
            connectToBroadcaster(socketInstance, defaultToken);
          } else {
            setStatus("Select a broadcaster");
            setToken("");
            setSelectedBroadcaster("");
          }
        } else {
          setStatus("No active broadcasters found");
          setBroadcasters([]);
          setToken("");
          setSelectedBroadcaster("");
        }
      });
    });

    socketInstance.on("connect_error", (err) => {
      console.error("Socket connect error:", err);
      setStatus("Failed to connect to server");
    });

    socketInstance.on("disconnect", () => {
      console.log("Socket disconnected");
      setStatus("Disconnected from server");
    });

    const statsInterval = setInterval(() => {
      if (peerConnection.current && token) {
        peerConnection.current.getStats().then((stats) => {
          console.log("WebRTC stats:", stats);
          socketInstance.emit("viewer_stats", { token, stats });
        });
      }
    }, 10000);

    return () => {
      socketInstance.disconnect();
      peerConnection.current?.close();
      clearInterval(statsInterval);
    };
  }, []);

  const connectToBroadcaster = (socketInstance: any, selectedToken: string) => {
    setToken(selectedToken);
    setStatus("Connecting to broadcaster...");
    socketInstance.emit("set_role", { role: "viewer", token: selectedToken }, (roleResponse: any) => {
      console.log("set_role response:", roleResponse);
      if (roleResponse.status === "success") {
        setStatus("Connected to broadcaster");
        socketInstance.emit("viewer_ready", selectedToken, (readyResponse: any) => {
          console.log("viewer_ready response:", readyResponse);
          if (readyResponse.status !== "success") {
            setStatus("Failed to initialize stream: " + readyResponse.message);
          }
        });
      } else {
        setStatus("Invalid token: " + roleResponse.message);
      }
    });
  };

  const handleBroadcasterSelect = (selectedToken: string) => {
    setSelectedBroadcaster(selectedToken);
    connectToBroadcaster(socket, selectedToken);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-black">
      {!isOBS && broadcasters.length > 0 && !token && (
        <div className="absolute top-4 w-full max-w-md bg-gray-800 p-4 rounded-lg">
          <h2 className="text-white text-lg mb-2">Select a Broadcaster</h2>
          {broadcasters.map((b) => (
            <button
              key={b.token}
              onClick={() => handleBroadcasterSelect(b.token)}
              className={`w-full text-left px-4 py-2 mb-2 rounded-lg ${
                selectedBroadcaster === b.token ? "bg-blue-600" : "bg-gray-700 hover:bg-gray-600"
              } text-white`}
            >
              {b.name || `Broadcaster ${b.token.slice(0, 8)}...`}
            </button>
          ))}
        </div>
      )}
      <video
        key={renderKey}
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full h-full object-contain"
        onError={(e) => {
          console.error("Video element error:", e);
          setStatus("Video error: " + (e as any).message);
        }}
        onLoadedMetadata={() => console.log("Video metadata loaded")}
        onCanPlay={() => console.log("Video can play")}
      />
      <p className="absolute bottom-4 text-sm text-white bg-black bg-opacity-50 px-2 py-1 rounded">
        {status}
      </p>
    </div>
  );
};

export default Viewer;
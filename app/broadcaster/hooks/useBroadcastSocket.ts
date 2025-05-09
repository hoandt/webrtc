import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { AuthState, BroadcastState } from "@/app/broadcaster/types/types";

export function useBroadcastSocket(
  authState: AuthState,
  streamRef: React.MutableRefObject<MediaStream | null>,
  peerConnections: React.MutableRefObject<Map<string, RTCPeerConnection>>,
  setBroadcastState: React.Dispatch<React.SetStateAction<BroadcastState>>
) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const serverUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      `${window.location.protocol}//${window.location.host}`;
    socketRef.current = io(serverUrl, {
      path: "/api/socket",
      reconnection: false,
      secure: serverUrl.startsWith("https"),
    });

    socketRef.current.on("connect", () => {
      console.log("Broadcaster socket connected:", socketRef.current?.id);
    });

    socketRef.current.on(
      "viewer_ready",
      async ({ viewerId }: { viewerId: string }) => {
        console.log("viewer_ready for viewer:", viewerId);
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        peerConnections.current.set(viewerId, pc);

        streamRef.current?.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current!);
        });

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketRef.current?.emit("candidate", {
              candidate: event.candidate,
              viewerId,
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed") {
            peerConnections.current.delete(viewerId);
          }
        };

        try {
          const offer = await pc.createOffer();
          offer.sdp = offer.sdp?.replace(
            /a=mid:(\d+)\r\n/,
            `a=mid:$1\r\nb=AS:10000\r\n`
          );
          await pc.setLocalDescription(offer);
          socketRef.current?.emit("offer", { offer, viewerId });
        } catch (err: any) {
          console.error("Error creating offer:", err);
          setBroadcastState((prev) => ({
            ...prev,
            error: "Error creating offer: " + err.message,
          }));
        }
      }
    );

    socketRef.current.on(
      "answer",
      async ({
        answer,
        viewerId,
      }: {
        answer: RTCSessionDescriptionInit;
        viewerId: string;
      }) => {
        const pc = peerConnections.current.get(viewerId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          } catch (err) {
            console.error("Error setting remote description:", err);
          }
        }
      }
    );

    socketRef.current.on(
      "candidate",
      async ({
        candidate,
        viewerId,
      }: {
        candidate: RTCIceCandidateInit;
        viewerId: string;
      }) => {
        const pc = peerConnections.current.get(viewerId);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error("Error adding ICE candidate:", err);
          }
        }
      }
    );

    socketRef.current.on(
      "viewer_count",
      ({ viewerCount }: { viewerCount: number }) => {
        setBroadcastState((prev) => ({ ...prev, viewerCount }));
      }
    );

    socketRef.current.on("connect_error", (err: any) => {
      console.error("Socket connect error:", err);
      setBroadcastState((prev) => ({
        ...prev,
        error: "Failed to connect to server",
        isStarting: false,
      }));
    });

    socketRef.current.on("disconnect", () => {
      console.log("Socket disconnected");
      setBroadcastState((prev) => ({
        ...prev,
        error: "Disconnected from server",
        isStarting: false,
      }));
    });

    return () => {
      socketRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peerConnections.current.forEach((pc) => pc.close());
    };
  }, []);

  return { socketRef };
}
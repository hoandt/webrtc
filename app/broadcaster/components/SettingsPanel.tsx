import React, { useEffect } from "react";
import { motion } from "framer-motion";
import { BroadcastState, AuthState } from "@/app/broadcaster/types/types";
import { Socket } from "socket.io-client";

interface SettingsPanelProps {
  authState: AuthState;
  setAuthState: React.Dispatch<React.SetStateAction<AuthState>>;
  handleLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
  cameraId: string;
  setCameraId: (id: string) => void;
  availableCameras: MediaDeviceInfo[];
  broadcastState: BroadcastState;
  setBroadcastState: React.Dispatch<React.SetStateAction<BroadcastState>>;
  streamRef: React.MutableRefObject<MediaStream | null>;
  videoRef: React.RefObject<HTMLVideoElement>;
  socketRef: React.MutableRefObject<Socket | null>;
  obsUrl: string;
  setObsUrl: (url: string) => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({
  authState,
  setAuthState,
  handleLogin,
  handleLogout,
  cameraId,
  setCameraId,
  availableCameras,
  broadcastState,
  setBroadcastState,
  streamRef,
  videoRef,
  socketRef,
  obsUrl,
  setObsUrl,
}) => {
  useEffect(() => {
    if (typeof window !== "undefined" && authState.userInfo?.phone) {
      const host = window.location.host;
      const protocol = window.location.protocol;
      const url = `${protocol}//${host}/viewer?phone=${encodeURIComponent(authState.userInfo.phone)}`;
      setObsUrl(url);
    }
  }, [authState.userInfo?.phone, setObsUrl]);

  const pauseStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = false;
      });
      setBroadcastState((prev) => ({ ...prev, isPaused: true }));
      socketRef.current?.emit("pause_broadcast");
      if (videoRef.current) {
        videoRef.current.pause();
      }
    }
  };

  const resumeStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.enabled = true;
      });
      setBroadcastState((prev) => ({ ...prev, isPaused: false }));
      socketRef.current?.emit("resume_broadcast");
      if (videoRef.current) {
        videoRef.current.play().catch((err) => {
          console.error("Error resuming video:", err);
          setBroadcastState((prev) => ({
            ...prev,
            error: "Failed to resume video: " + err.message,
          }));
        });
      }
    }
  };

  const handleStartBroadcast = () => {
    if (broadcastState.isStarting || !authState.jwtToken || !authState.userInfo?.phone) return;
    setBroadcastState((prev) => ({ ...prev, isStarting: true, error: "" }));
    socketRef.current?.emit(
      "set_role",
      {
        role: "broadcaster",
        phone: authState.userInfo.phone,
        name: broadcastState.broadcasterName || authState.userInfo.fullName,
        jwt: authState.jwtToken,
      },
      (response: any) => {
        console.log("set_role response:", response);
        if (response.status === "success") {
          setBroadcastState((prev) => ({
            ...prev,
            isBroadcasting: true,
            isStarting: false,
          }));
        } else {
          setBroadcastState((prev) => ({
            ...prev,
            error: "Failed to set broadcaster role: " + response.message,
            isStarting: false,
          }));
        }
      }
    );
  };

  const handleStopBroadcast = () => {
    socketRef.current?.emit("stop_broadcast", (response: any) => {
      if (response.status === "success") {
        setBroadcastState((prev) => ({
          ...prev,
          isBroadcasting: false,
          broadcasterName:"",
          viewerCount: 0,
          isStarting: false,
          isPaused: false,
        }));
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      } else {
        setBroadcastState((prev) => ({
          ...prev,
          error: "Failed to stop broadcast: " + response.message,
        }));
      }
    });
  };

  // Generate camera label
  const getCameraLabel = (camera: MediaDeviceInfo, index: number) => {
    const label = camera.label.toLowerCase();
    if (label.includes("back") || label.includes("environment")) {
      return "Back Camera";
    } else if (label.includes("front") || label.includes("user")) {
      return "Front Camera";
    }
    return camera.label || `Camera ${index + 1}`;
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex justify-between items-center mb-4">
        {authState.isLoggedIn ? (
          <select
            value={cameraId}
            onChange={(e) => setCameraId(e.target.value)}
            className="bg-gray-800 text-white text-sm rounded-lg px-3 py-2 w-full max-w-[70%]"
          >
            {availableCameras.length === 0 ? (
              <option value="">No cameras available</option>
            ) : (
              availableCameras.map((camera, idx) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {getCameraLabel(camera, idx)}
                </option>
              ))
            )}
          </select>
        ) : (
          <h1 className="text-lg font-medium">Camera Access</h1>
        )}
        {authState.isLoggedIn && (
          <button
            onClick={handleLogout}
            className="text-sm text-red-400 hover:text-red-300 ml-2"
          >
            Logout
          </button>
        )}
      </div>
      <div className="mt-4 space-y-3">
        {!authState.isLoggedIn ? (
          <div className="space-y-3">
            <input
              type="text"
              value={authState.loginCredential}
              onChange={(e) =>
                setAuthState((prev) => ({ ...prev, loginCredential: e.target.value }))
              }
              placeholder="Username or email"
              className="w-full px-3 py-2 bg-gray-900 rounded-lg placeholder-gray-400"
            />
            <input
              type="password"
              value={authState.password}
              onChange={(e) =>
                setAuthState((prev) => ({ ...prev, password: e.target.value }))
              }
              placeholder="Password"
              className="w-full px-3 py-2 bg-gray-900 rounded-lg placeholder-gray-400"
            />
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={authState.rememberMe}
                onChange={(e) =>
                  setAuthState((prev) => ({ ...prev, rememberMe: e.target.checked }))
                }
                className="rounded text-blue-600"
              />
              <span className="text-sm text-gray-400">Remember me</span>
            </label>
            <motion.button
              onClick={handleLogin}
              className="w-full px-4 py-2 bg-blue-600 rounded-lg"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Sign In
            </motion.button>
          </div>
        ) : (
          <>
            {!broadcastState.isBroadcasting ? (
              <>
                <input
                  type="text"
                  value={broadcastState.broadcasterName}
                  onChange={(e) =>
                    setBroadcastState((prev) => ({
                      ...prev,
                      broadcasterName: e.target.value,
                    }))
                  }
                  placeholder="Stream name"
                  className="w-full px-3 py-2 bg-gray-800 rounded-lg text-sm"
                />
                <motion.button
                  onClick={handleStartBroadcast}
                  disabled={broadcastState.isStarting}
                  className={`w-full px-4 py-3 rounded-lg font-medium ${
                    broadcastState.isStarting
                      ? "bg-gray-700"
                      : "bg-green-600 hover:bg-green-500"
                  }`}
                  whileHover={{ scale: broadcastState.isStarting ? 1 : 1.02 }}
                  whileTap={{ scale: broadcastState.isStarting ? 1 : 0.98 }}
                >
                  {broadcastState.isStarting ? "Starting..." : "Go Live"}
                </motion.button>
              </>
            ) : (
              <div className="flex space-x-2">
                <motion.button
                  onClick={broadcastState.isPaused ? resumeStream : pauseStream}
                  className={`flex-1 px-4 py-2 rounded-lg ${
                    broadcastState.isPaused ? "bg-green-600" : "bg-yellow-600"
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {broadcastState.isPaused ? "Resume" : "Pause"}
                </motion.button>
                <motion.button
                  onClick={handleStopBroadcast}
                  className="flex-1 px-4 py-2 bg-red-600 rounded-lg"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Stop
                </motion.button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPanel;
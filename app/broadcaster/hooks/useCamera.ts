import { useEffect, useState } from "react";

export function useCamera() {
  const [cameraId, setCameraId] = useState<string>("");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const getCameras = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === "videoinput");
        setAvailableCameras(videoDevices);
        const savedCameraId = localStorage.getItem("preferredCameraId");
        if (savedCameraId && videoDevices.some((device) => device.deviceId === savedCameraId)) {
          setCameraId(savedCameraId);
        } else if (videoDevices.length > 0) {
          setCameraId(videoDevices[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating devices:", err);
      }
    };
    getCameras();
  }, []);

  useEffect(() => {
    if (cameraId) {
      localStorage.setItem("preferredCameraId", cameraId);
    }
  }, [cameraId]);

  return { cameraId, setCameraId, availableCameras };
}
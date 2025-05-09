import { useEffect, useState } from "react";

export function useCamera() {
  const [cameraId, setCameraId] = useState<string>("");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    const getCameras = async () => {
      try {
        // Request camera permission to ensure labels are populated
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((track) => track.stop()); // Stop stream immediately

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === "videoinput");
        setAvailableCameras(videoDevices);

        // Prefer back camera by default if available
        const backCamera = videoDevices.find((device) =>
          device.label.toLowerCase().includes("back") || device.label.toLowerCase().includes("environment")
        );
        const savedCameraId = localStorage.getItem("preferredCameraId");
        if (savedCameraId && videoDevices.some((device) => device.deviceId === savedCameraId)) {
          setCameraId(savedCameraId);
        } else if (backCamera) {
          setCameraId(backCamera.deviceId);
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
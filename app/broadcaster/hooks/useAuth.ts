import { useEffect, useState } from "react";
import axios, { AxiosError } from "axios";
import { decodeJwt } from "@/app/broadcaster/utils/jwt";
import { AuthState, UserInfo, JwtPayload } from "@/app/broadcaster/types/types";

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    jwtToken: "",
    userId: "",
    loginCredential: "",
    password: "",
    rememberMe: true,
    userInfo: null,
    error: "",
  });

  // Validate JWT token (client-side and server-side)
  const validateToken = async (token: string): Promise<boolean> => {
    try {
      // Client-side validation
      const payload = decodeJwt(token);
      const currentTime = Math.floor(Date.now() / 1000);
      if (!payload.UserId || !payload.exp || payload.exp <= currentTime) {
        console.warn("Token invalid or expired:", payload);
        return false;
      }

      // Server-side validation (optional, using user-info endpoint)
      const response = await axios.get(`/api/user-info?id=${payload.UserId}`, {
        headers: {
          accept: "text/plain",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.status !== 1 || !response.data.data) {
        console.warn("Server rejected token:", response.data.message);
        return false;
      }

      return true;
    } catch (err) {
      console.error("Token validation error:", err);
      return false;
    }
  };

  // Force logout
  const forceLogout = (
    streamRef?: React.MutableRefObject<MediaStream | null>,
    peerConnections?: React.MutableRefObject<Map<string, RTCPeerConnection>>
  ) => {
    // 🔌 Stop media stream
    if (streamRef?.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  
    // ❌ Close all WebRTC peer connections
    if (peerConnections?.current) {
      peerConnections.current.forEach((pc) => pc.close());
      peerConnections.current.clear();
    }
  
    setAuthState({
      isLoggedIn: false,
      jwtToken: "",
      userId: "",
      loginCredential: "",
      password: "",
      rememberMe: true,
      userInfo: null,
      error: "Session expired. Please log in again.",
    });
  
    localStorage.removeItem("jwtToken");
  };
  

  // Fetch user info
  const fetchUserInfo = async (userId: string, token: string) => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      const response = await axios.get(`/api/user-info?id=${userId}`, {
        headers: {
          accept: "text/plain",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.data.status === 1 && response.data.data) {
        const data = response.data.data;
        if (data.isBlocked) {
          setAuthState((prev) => ({
            ...prev,
            error: "Your account is blocked. Please contact support.",
            isLoggedIn: false,
            jwtToken: "",
            userId: "",
            userInfo: null,
          }));
          localStorage.removeItem("jwtToken");
          return;
        }
        if (data.needResetPassword) {
          setAuthState((prev) => ({
            ...prev,
            error: "Please reset your password before proceeding.",
            isLoggedIn: false,
            jwtToken: "",
            userId: "",
            userInfo: null,
          }));
          localStorage.removeItem("jwtToken");
          return;
        }
        setAuthState((prev) => ({ ...prev, userInfo: data }));
      } else {
        setAuthState((prev) => ({
          ...prev,
          error: response.data.message || "Failed to fetch user info",
        }));
      }
    } catch (err: any) {
      console.error("User info error:", err);
      setAuthState((prev) => ({
        ...prev,
        error: err.response?.data?.message || "Failed to fetch user info",
      }));
      if (err.response?.status === 401) {
        forceLogout();
      }
    }
  };

  // Handle login
  const handleLogin = async () => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      const response = await axios.post("/api/login", {
        loginCredential: authState.loginCredential,
        password: authState.password,
      });

      if (response.data.status === 1 && response.data.data?.token) {
        if (response.data.data.needChangePassword) {
          setAuthState((prev) => ({
            ...prev,
            error: "Please change your password before proceeding.",
          }));
          return;
        }

        const token = response.data.data.token;
        const payload = decodeJwt(token);

        if (payload.UserId) {
          setAuthState((prev) => ({
            ...prev,
            jwtToken: token,
            isLoggedIn: true,
            userId: payload.UserId!,
            loginCredential: "",
            password: "",
          }));
          if (authState.rememberMe) {
            localStorage.setItem("jwtToken", token);
          }
        } else {
          setAuthState((prev) => ({
            ...prev,
            error: "Invalid JWT: UserId not found",
          }));
        }
      } else {
        setAuthState((prev) => ({
          ...prev,
          error: response.data.message || "Authentication failed",
        }));
      }
    } catch (err: any) {
      console.error("Login error:", err);
      setAuthState((prev) => ({
        ...prev,
        error: err.response?.data?.message || "Login failed",
      }));
    }
  };

  // Handle logout
  const handleLogout = async (
    streamRef?: React.MutableRefObject<MediaStream | null>,
    peerConnections?: React.MutableRefObject<Map<string, RTCPeerConnection>>
  ) => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      await axios.post("/api/logout", {}, {
        headers: {
          accept: "text/plain",
          "Content-Type": "application/json",
          Authorization: `Bearer ${authState.jwtToken}`,
        },
      });
    } catch (err: any) {
      console.error("Logout error:", err);
      setAuthState((prev) => ({ ...prev, error: "Logout failed" }));
    } finally {
      forceLogout(streamRef, peerConnections);
      console.log("Out")
    }
  };
  

  // Axios interceptor for 401 errors
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          forceLogout();
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []);

  // Check token on load
  useEffect(() => {
    const storedToken = localStorage.getItem("jwtToken");
    if (storedToken) {
      validateToken(storedToken).then((isValid) => {
        if (isValid) {
          const payload = decodeJwt(storedToken);
          setAuthState((prev) => ({
            ...prev,
            jwtToken: storedToken,
            userId: payload.UserId!,
            isLoggedIn: true,
          }));
        } else {
          forceLogout();
        }
      });
    }
  }, []);

  // Periodic token validation
  useEffect(() => {
    if (authState.isLoggedIn && authState.jwtToken) {
      const interval = setInterval(() => {
        validateToken(authState.jwtToken).then((isValid) => {
          if (!isValid) {
            forceLogout();
          }
        });
      }, 5 * 60 * 1000); // Check every 5 minutes

      return () => clearInterval(interval);
    }
  }, [authState.isLoggedIn, authState.jwtToken]);

  // Fetch user info
  useEffect(() => {
    if (authState.isLoggedIn && authState.jwtToken && authState.userId) {
      fetchUserInfo(authState.userId, authState.jwtToken);
    }
  }, [authState.isLoggedIn, authState.jwtToken, authState.userId]);

  return { authState, setAuthState, handleLogin, handleLogout, validateToken };
}
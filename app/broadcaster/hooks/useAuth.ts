import { useEffect, useState } from "react";
import axios from "axios";
import { decodeJwt } from "@/app/broadcaster/utils/jwt";
import { AuthState, UserInfo, JwtPayload } from "@/app/broadcaster/types/types";

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isLoggedIn: false,
    jwtToken: "",
    userId: "",
    loginCredential: "",
    password: "",
    rememberMe: false,
    userInfo: null,
  });

  const fetchUserInfo = async (userId: string, token: string) => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      const response = await axios.get(
        `https://layer-api.swifthub.net/api/identity/v1/User/getUserInfo?id=${userId}`,
        {
          headers: {
            accept: "text/plain",
            Authorization: `Bearer ${token}`,
          },
        }
      );
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
    }
  };

  const handleLogin = async () => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      const response = await axios.post(
        "https://layer-api.swifthub.net/api/identity/v1/Authentication/login",
        {
          loginCredential: authState.loginCredential,
          password: authState.password,
        },
        {
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

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

  const handleLogout = async () => {
    try {
      setAuthState((prev) => ({ ...prev, error: "" }));
      await axios.post(
        "https://layer-api.swifthub.net/api/identity/v1/Authentication/logout",
        {},
        {
          headers: {
            accept: "text/plain",
            "Content-Type": "application/json",
            Authorization: `Bearer ${authState.jwtToken}`,
          },
        }
      );
      setAuthState((prev) => ({
        ...prev,
        isLoggedIn: false,
        jwtToken: "",
        userId: "",
        userInfo: null,
      }));
      localStorage.removeItem("jwtToken");
    } catch (err: any) {
      console.error("Logout error:", err);
      setAuthState((prev) => ({ ...prev, error: "Logout failed" }));
    }
  };

  useEffect(() => {
    const storedToken = localStorage.getItem("jwtToken");
    if (storedToken) {
      const payload = decodeJwt(storedToken);
      const currentTime = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp > currentTime && payload.UserId) {
        setAuthState((prev) => ({
          ...prev,
          jwtToken: storedToken,
          userId: payload.UserId!,
          isLoggedIn: true,
        }));
      } else {
        localStorage.removeItem("jwtToken");
      }
    }
  }, []);

  useEffect(() => {
    if (authState.isLoggedIn && authState.jwtToken && authState.userId) {
      fetchUserInfo(authState.userId, authState.jwtToken);
    }
  }, [authState.isLoggedIn, authState.jwtToken, authState.userId]);

  return { authState, setAuthState, handleLogin, handleLogout };
}
export interface UserInfo {
    id: string;
    userName: string;
    fullName: string;
    email: string;
    isActive: boolean;
    isBlocked: boolean;
    needResetPassword: boolean;
    phone: string;
    tenantName: string;
    userTypeName: string;
    userRoles: { roleName: string | null }[];
    isAdmin: boolean;
    swifttrack: {
      subscription_plan: string | null;
      expiredAt: string | null;
    };
  }
  
  export interface JwtPayload {
    UserId?: string;
    exp?: number;
  }
  
  export interface AuthState {
    isLoggedIn: boolean;
    jwtToken: string;
    userId: string;
    loginCredential: string;
    password: string;
    rememberMe: boolean;
    userInfo: UserInfo | null;
    error?: string;
  }
  
  export interface BroadcastState {
    isBroadcasting: boolean;
    viewerCount: number;
    broadcasterName: string;
    isStarting: boolean;
    isPaused: boolean;
    error: string;
  }
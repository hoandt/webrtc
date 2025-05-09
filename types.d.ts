import { Server as HttpServer } from 'http';
import { NextApiResponse } from 'next';
import { Server as SocketIOServer } from 'socket.io';

export type NextApiResponseServerIO = NextApiResponse & {
  socket: {
    server: HttpServer & {
      io?: SocketIOServer;
    };
  };
};

export interface AuthState {
  isLoggedIn: boolean;
  jwtToken: string;
  userId: string;
  loginCredential: string;
  password: string;
  rememberMe: boolean;
  userInfo: { phone: string; fullName: string } | null;
  error: string;
}
import { createServer } from "node:http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import crypto from "crypto";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3000;
const corsOrigin = process.env.CORS_ORIGIN || (dev ? "http://localhost:3000" : "*");
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handler(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    path: "/api/socket",
    addTrailingSlash: false,
    pingTimeout: 60000,
    pingInterval: 10000,
    cors: {
      origin: corsOrigin,
      methods: ["GET", "POST"],
    },
  });

  const broadcasters = new Map();

  const generateToken = () => crypto.randomUUID();

  const findBroadcasterByToken = (token) => {
    for (const [id, data] of broadcasters) {
      if (data.token === token) return { id, data };
    }
    return null;
  };

  io.on("connection", (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on("get_broadcasters", (callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      const broadcasterList = Array.from(broadcasters.entries()).map(([id, { token, name }]) => ({
        token,
        name,
      }));
      logger.info(`Sending broadcasters to ${socket.id}: ${broadcasterList.length} broadcasters`);
      cb({ status: "success", broadcasters: broadcasterList });
    });

    socket.on("get_latest_token", (callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      if (broadcasters.size > 0) {
        const [id, { token }] = broadcasters.entries().next().value;
        logger.info(`Sending latest token to ${socket.id}: ${token}`);
        cb({ status: "success", token });
      } else {
        logger.warn(`No active broadcaster for ${socket.id}`);
        cb({ status: "error", message: "No active broadcaster" });
      }
    });

    socket.on("viewer_ready", (token, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        const broadcaster = findBroadcasterByToken(token);
        if (broadcaster) {
          const { id: broadcasterId } = broadcaster;
          logger.info(`viewer_ready: token=${token}, viewerId=${socket.id} -> broadcaster ${broadcasterId}`);
          socket.to(broadcasterId).emit("viewer_ready", {
            viewerId: socket.id,
            timestamp: Date.now(),
          });
          cb({ status: "success" });
        } else {
          logger.warn(`No broadcaster found for token: ${token}`);
          cb({ status: "error", message: "Invalid token" });
        }
      } catch (err) {
        logger.error(`viewer_ready: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("viewer_stats", ({ token, stats }, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        const broadcaster = findBroadcasterByToken(token);
        if (broadcaster) {
          const { id: broadcasterId } = broadcaster;
          logger.info(`viewer_stats: token=${token}, viewerId=${socket.id} -> broadcaster ${broadcasterId}`);
          socket.to(broadcasterId).emit("viewer_stats", {
            viewerId: socket.id,
            stats,
          });
          cb({ status: "success" });
        } else {
          logger.warn(`No broadcaster found for token: ${token}`);
          cb({ status: "error", message: "Invalid token" });
        }
      } catch (err) {
        logger.error(`viewer_stats: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("disconnect", () => {
      try {
        logger.info(`Client disconnected: ${socket.id}`);
        if (broadcasters.has(socket.id)) {
          const { viewers, token } = broadcasters.get(socket.id);
          viewers.forEach((_, viewerId) => {
            logger.info(`Notifying viewer ${viewerId} of broadcaster disconnection`);
            io.to(viewerId).emit("broadcaster_disconnected");
          });
          broadcasters.delete(socket.id);
          logger.info(`Broadcaster ${socket.id} (token: ${token}) disconnected`);
        } else {
          broadcasters.forEach(({ viewers }, broadcasterId) => {
            if (viewers.has(socket.id)) {
              viewers.delete(socket.id);
              logger.info(`Viewer ${socket.id} removed from broadcaster ${broadcasterId}`);
              io.to(broadcasterId).emit("viewer_count", {
                viewerCount: viewers.size,
              });
            }
          });
        }
      } catch (err) {
        logger.error(`disconnect: ${err.message}`);
      }
    });

    socket.on("set_role", (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        logger.info(`set_role: sid=${socket.id}, role=${data.role}, token=${data.token || "none"}, name=${data.name || "none"}`);
        
        if (data.role === "broadcaster") {
          let token = data.token || generateToken();
          const name = data.name || `Broadcaster ${socket.id.slice(0, 8)}`;
          const existing = [...broadcasters.entries()].find(
            ([id, { token: bToken }]) => bToken === token && id !== socket.id
          );
          if (existing) {
            logger.warn(`Token ${token} already in use`);
            cb({ status: "error", message: "Token in use" });
            return;
          }
          broadcasters.set(socket.id, {
            broadcasterId: socket.id,
            token,
            name,
            viewers: broadcasters.get(socket.id)?.viewers || new Map(),
          });
          logger.info(`Broadcaster set: ${socket.id}, token: ${token}, name: ${name}`);
          cb({ status: "success", broadcastToken: token });
          io.to(socket.id).emit("viewer_count", {
            viewerCount: broadcasters.get(socket.id).viewers.size,
          });
        } else if (data.role === "viewer") {
          const token = data.token || "";
          let broadcasterId = null;
          for (const [id, { token: bToken, viewers }] of broadcasters) {
            if (token === bToken) {
              broadcasterId = id;
              viewers.set(socket.id, { socketId: socket.id });
              logger.info(`Viewer ${socket.id} added to broadcaster ${broadcasterId}`);
              io.to(broadcasterId).emit("new_viewer", { viewerId: socket.id });
              io.to(broadcasterId).emit("viewer_count", { viewerCount: viewers.size });
              cb({ status: "success" });
              break;
            }
          }
          if (!broadcasterId) {
            logger.warn(`Viewer rejected: ${socket.id}, invalid token: ${token}`);
            cb({ status: "error", message: "Unauthorized: Invalid token" });
            socket.disconnect();
          }
        } else {
          cb({ status: "error", message: "Invalid role" });
        }
      } catch (err) {
        logger.error(`set_role: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("revoke_token", (callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        if (broadcasters.has(socket.id)) {
          const { viewers, token } = broadcasters.get(socket.id);
          viewers.forEach((_, viewerId) => {
            logger.info(`Notifying viewer ${viewerId} of broadcaster disconnection`);
            io.to(viewerId).emit("broadcaster_disconnected");
          });
          broadcasters.delete(socket.id);
          logger.info(`Broadcaster ${socket.id} revoked token: ${token}`);
          cb({ status: "success" });
        } else {
          cb({ status: "error", message: "Not a broadcaster" });
        }
      } catch (err) {
        logger.error(`revoke_token: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("offer", (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        if (broadcasters.has(socket.id)) {
          const { offer, viewerId } = data;
          const { viewers } = broadcasters.get(socket.id);
          if (viewers.has(viewerId)) {
            logger.info(`offer: broadcaster ${socket.id} -> viewer ${viewerId}`);
            io.to(viewerId).emit("offer", offer);
            cb({ status: "success" });
          } else {
            logger.warn(`Viewer ${viewerId} not found for broadcaster ${socket.id}`);
            cb({ status: "error", message: "Viewer not found" });
          }
        } else {
          cb({ status: "error", message: "Not a broadcaster" });
        }
      } catch (err) {
        logger.error(`offer: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("answer", (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        let callbackInvoked = false;
        broadcasters.forEach(({ viewers }, broadcasterId) => {
          if (viewers.has(socket.id)) {
            logger.info(`answer: viewer ${socket.id} -> broadcaster ${broadcasterId}`);
            io.to(broadcasterId).emit("answer", {
              answer: data.answer,
              viewerId: socket.id,
            });
            cb({ status: "success" });
            callbackInvoked = true;
          }
        });
        if (!callbackInvoked) {
          cb({ status: "error", message: "Not a viewer" });
        }
      } catch (err) {
        logger.error(`answer: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("candidate", (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        let callbackInvoked = false;
        if (broadcasters.has(socket.id)) {
          const { candidate, viewerId } = data;
          const { viewers } = broadcasters.get(socket.id);
          if (viewers.has(viewerId)) {
            logger.info(`candidate: broadcaster ${socket.id} -> viewer ${viewerId}`);
            io.to(viewerId).emit("candidate", candidate);
            cb({ status: "success" });
            callbackInvoked = true;
          } else {
            logger.warn(`Viewer ${viewerId} not found for broadcaster ${socket.id}`);
            cb({ status: "error", message: "Viewer not found" });
            callbackInvoked = true;
          }
        } else {
          broadcasters.forEach(({ viewers }, broadcasterId) => {
            if (viewers.has(socket.id)) {
              logger.info(`candidate: viewer ${socket.id} -> broadcaster ${broadcasterId}`);
              io.to(broadcasterId).emit("candidate", {
                candidate: data.candidate,
                viewerId: socket.id,
              });
              cb({ status: "success" });
              callbackInvoked = true;
            }
          });
        }
        if (!callbackInvoked) {
          cb({ status: "error", message: "Not a viewer" });
        }
      } catch (err) {
        logger.error(`candidate: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });
  });

  setInterval(() => {
    try {
      broadcasters.forEach(({ viewers }, broadcasterId) => {
        let updated = false;
        viewers.forEach((_, viewerId) => {
          if (!io.sockets.sockets.has(viewerId)) {
            viewers.delete(viewerId);
            logger.info(`Cleaned up stale viewer ${viewerId} for broadcaster ${broadcasterId}`);
            updated = true;
          }
        });
        if (updated) {
          io.to(broadcasterId).emit("viewer_count", {
            viewerCount: viewers.size,
          });
        }
      });
    } catch (err) {
      logger.error(`Cleanup interval: ${err.message}`);
    }
  }, 30 * 1000);

  httpServer
    .once("error", (err) => {
      logger.error(`Server error: ${err.message}`);
      process.exit(1);
    })
    .listen(port, () => {
      logger.info(`Server listening on http://${hostname}:${port}`);
    });
});
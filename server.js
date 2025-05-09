import { createServer } from "node:http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT, 10) || 3000;
const corsOrigin = process.env.CORS_ORIGIN || (dev ? "http://localhost:3000" : "*");
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const logger = {
  info: (msg) => console.log(`[${new Date().toISOString()}] [INFO] ${msg}`),
  warn: (msg) => console.warn(`[${new Date().toISOString()}] [WARN] ${msg}`),
  error: (msg) => console.error(`[${new Date().toISOString()}] [ERROR] ${msg}`),
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

  const findBroadcasterByPhone = (phone) => {
    for (const [id, data] of broadcasters) {
      if (data.phone === phone) return { id, data };
    }
    return null;
  };

  io.on("connection", (socket) => {
    logger.info(`Client connected: ${socket.id}`);

    socket.on("get_broadcaster_name", (phone, callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      const broadcaster = findBroadcasterByPhone(phone);
      if (broadcaster) {
        logger.info(`Sending broadcaster name for phone: ${phone} to ${socket.id}`);
        cb({ status: "success", name: broadcaster.data.name });
      } else {
        logger.warn(`No broadcaster found for phone: ${phone || "empty"}`);
        cb({ status: "error", message: "Broadcaster not found" });
      }
    });

    socket.on("check_broadcaster", (phone, callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      const broadcaster = findBroadcasterByPhone(phone);
      logger.info(`Checking broadcaster for phone: ${phone} for ${socket.id}`);
      cb({ status: "success", exists: !!broadcaster });
    });

    socket.on("get_broadcasters", (callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      const broadcasterList = Array.from(broadcasters.entries()).map(([id, { phone, name }]) => ({
        phone,
        name,
      }));
      logger.info(`Sending broadcasters to ${socket.id}: ${broadcasterList.length} broadcasters`);
      cb({ status: "success", broadcasters: broadcasterList });
    });

    socket.on("get_latest_broadcaster", (callback) => {
      const cb = typeof callback === "function" ? callback : () => {};
      if (broadcasters.size > 0) {
        const [id, { phone, name }] = broadcasters.entries().next().value;
        logger.info(`Sending latest broadcaster to ${socket.id}: ${phone}`);
        cb({ status: "success", phone, name });
      } else {
        logger.warn(`No active broadcaster for ${socket.id}`);
        cb({ status: "error", message: "No active broadcaster" });
      }
    });

    socket.on("viewer_ready", (phone, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        const broadcaster = findBroadcasterByPhone(phone);
        if (broadcaster) {
          const { id: broadcasterId, data: { viewers } } = broadcaster;
          logger.info(`viewer_ready: phone=${phone}, viewerId=${socket.id} -> broadcaster ${broadcasterId}`);
          socket.to(broadcasterId).emit("viewer_ready", {
            viewerId: socket.id,
            timestamp: Date.now(),
          });
          viewers.set(socket.id, { socketId: socket.id });
          socket.to(broadcasterId).emit("viewer_count", { viewerCount: viewers.size });
          cb({ status: "success" });
        } else {
          logger.warn(`No broadcaster found for phone: ${phone || "empty"}`);
          cb({ status: "error", message: "Invalid phone number" });
        }
      } catch (err) {
        logger.error(`viewer_ready: ${err.message}`);
        callback?.({ status: "error", message: "Server error" });
      }
    });

    socket.on("pause_broadcast", () => {
      if (broadcasters.has(socket.id)) {
        logger.info(`Broadcaster ${socket.id} paused broadcast`);
        const { viewers } = broadcasters.get(socket.id);
        viewers.forEach((_, viewerId) => {
          socket.to(viewerId).emit("broadcaster_paused");
        });
      }
    });

    socket.on("resume_broadcast", () => {
      if (broadcasters.has(socket.id)) {
        logger.info(`Broadcaster ${socket.id} resumed broadcast`);
        const { viewers } = broadcasters.get(socket.id);
        viewers.forEach((_, viewerId) => {
          socket.to(viewerId).emit("broadcaster_resumed");
        });
      }
    });

    socket.on("disconnect", () => {
      try {
        logger.info(`Client disconnected: ${socket.id}`);
        if (broadcasters.has(socket.id)) {
          const { viewers, phone } = broadcasters.get(socket.id);
          viewers.forEach((_, viewerId) => {
            logger.info(`Notifying viewer ${viewerId} of broadcaster disconnection`);
            io.to(viewerId).emit("broadcaster_disconnected");
          });
          broadcasters.delete(socket.id);
          logger.info(`Broadcaster ${socket.id} (phone: ${phone}) disconnected`);
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

    socket.on("set_role", async (data, callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        const phone = data.phone || "";
        logger.info(`set_role: sid=${socket.id}, role=${data.role}, phone=${phone || "none"}, name=${data.name || "none"}`);

        if (data.role === "broadcaster") {
          if (!phone) {
            logger.warn(`Missing phone number for broadcaster ${socket.id}`);
            cb({ status: "error", message: "Phone number required" });
            return;
          }
          const existing = [...broadcasters.entries()].find(
            ([id, { phone: bPhone }]) => bPhone === phone && id !== socket.id
          );
          if (existing) {
            logger.warn(`Phone ${phone} already in use`);
            cb({ status: "error", message: "Phone number in use" });
            return;
          }
          broadcasters.set(socket.id, {
            broadcasterId: socket.id,
            phone,
            name: data.name || `Broadcaster ${socket.id.slice(0, 8)}`,
            viewers: broadcasters.get(socket.id)?.viewers || new Map(),
          });
          logger.info(`Broadcaster set: ${socket.id}, phone: ${phone}, name: ${data.name || `Broadcaster ${socket.id.slice(0, 8)}`}`);
          cb({ status: "success" });
          io.to(socket.id).emit("viewer_count", {
            viewerCount: broadcasters.get(socket.id).viewers.size,
          });
        } else if (data.role === "viewer") {
          if (!phone) {
            logger.warn(`Viewer rejected: ${socket.id}, missing phone`);
            cb({ status: "error", message: "Phone number required" });
            socket.disconnect();
            return;
          }
          let broadcasterId = null;
          for (const [id, { phone: bPhone, viewers }] of broadcasters) {
            if (bPhone === phone) {
              broadcasterId = id;
              viewers.set(socket.id, { socketId: socket.id });
              logger.info(`Viewer ${socket.id} added to broadcaster ${broadcasterId} (phone: ${phone})`);
              io.to(broadcasterId).emit("new_viewer", { viewerId: socket.id });
              io.to(broadcasterId).emit("viewer_count", { viewerCount: viewers.size });
              cb({ status: "success" });
              break;
            }
          }
          if (!broadcasterId) {
            logger.warn(`Viewer rejected: ${socket.id}, invalid phone: ${phone}`);
            cb({ status: "error", message: "Unauthorized: Invalid phone number" });
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

    socket.on("stop_broadcast", (callback) => {
      try {
        const cb = typeof callback === "function" ? callback : () => {};
        if (broadcasters.has(socket.id)) {
          const { viewers, phone } = broadcasters.get(socket.id);
          viewers.forEach((_, viewerId) => {
            logger.info(`Notifying viewer ${viewerId} of broadcaster disconnection`);
            io.to(viewerId).emit("broadcaster_disconnected");
          });
          broadcasters.delete(socket.id);
          logger.info(`Broadcaster ${socket.id} stopped broadcast: ${phone}`);
          cb({ status: "success" });
        } else {
          cb({ status: "error", message: "Not a broadcaster" });
        }
      } catch (err) {
        logger.error(`stop_broadcast: ${err.message}`);
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
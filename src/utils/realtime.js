// src/utils/realtime.js
import { Server as IOServer } from "socket.io";

let io = null;

/**
 * Initialize Socket.IO server with correct CORS for Render + local dev.
 */
export function initRealtime(httpServer) {
  if (io) return io;

  io = new IOServer(httpServer, {
    cors: {
      origin: [
        "http://localhost:5173",
        "https://watsappai.onrender.com",
        "https://watsappai2.onrender.com",
      ],
      methods: ["GET", "POST"],
      credentials: true,
      transports: ["polling", "websocket"]
    },
    allowEIO3: true,
  });

  io.on("connection", (socket) => {
    console.log("⚡ Client connected:", socket.id);

    socket.on("subscribe", (payload) => {
      try {
        if (!payload) return;

        if (payload.phone) {
          socket.join(`phone:${payload.phone}`);
          console.log(`📌 Joined phone room: phone:${payload.phone}`);
        }

        if (payload.tenantId) {
          socket.join(`tenant:${payload.tenantId}`);
          console.log(`📌 Joined tenant room: tenant:${payload.tenantId}`);
        }
      } catch (err) {
        console.warn("subscribe error:", err.message);
      }
    });

    socket.on("unsubscribe", (payload) => {
      try {
        if (!payload) return;

        if (payload.phone) {
          socket.leave(`phone:${payload.phone}`);
        }

        if (payload.tenantId) {
          socket.leave(`tenant:${payload.tenantId}`);
        }
      } catch (err) {
        console.warn("unsubscribe error:", err.message);
      }
    });

    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
    });
  });

  console.log("✅ Realtime / Socket.IO initialized");
  return io;
}

/**
 * Emit event to phone-specific or tenant-specific rooms.
 */
export function pushEvent(eventName, payload = {}, opts = {}) {
  if (!io) {
    console.warn("pushEvent: realtime not initialized → skipped:", eventName);
    return;
  }

  try {
    if (opts.phone) {
      io.to(`phone:${opts.phone}`).emit(eventName, payload);
      return; // only emit to phone room
    }

    if (opts.tenantId) {
      io.to(`tenant:${opts.tenantId}`).emit(eventName, payload);
      return; // only emit to tenant room
    }

    // broadcast globally
    io.emit(eventName, payload);
  } catch (err) {
    console.error("pushEvent error:", err.message);
  }
}

/**
 * Allow direct access to io if needed.
 */
export function getIo() {
  return io;
}

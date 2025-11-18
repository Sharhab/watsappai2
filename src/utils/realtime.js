// src/utils/realtime.js
import { Server as IOServer } from "socket.io";

let io = null;

/**
 * Initialize Socket.IO server.
 * Call once after httpServer.listen() (or before, but pass server).
 * Returns the io instance.
 */
export function initRealtime(httpServer, { cors = { origin: "*" } } = {}) {
  if (io) return io;
  io = new IOServer(httpServer, { cors });
  io.on("connection", (socket) => {
    // join a room for the tenant or phone if client asks
    socket.on("subscribe", (payload) => {
      // payload: { phone } or { tenantId }
      try {
        if (payload?.phone) socket.join(`phone:${payload.phone}`);
        if (payload?.tenantId) socket.join(`tenant:${payload.tenantId}`);
      } catch (e) {
        console.warn("subscribe error", e?.message || e);
      }
    });

    socket.on("unsubscribe", (payload) => {
      if (payload?.phone) socket.leave(`phone:${payload.phone}`);
      if (payload?.tenantId) socket.leave(`tenant:${payload.tenantId}`);
    });

    socket.on("disconnect", () => {
      // nothing special for now
    });
  });

  console.log("✅ Realtime / Socket.IO initialized");
  return io;
}

/**
 * Emit event to either a specific phone or tenant room (or broadcast).
 * If `opts.phone` provided -> emit to socket room `phone:${phone}`.
 * If `opts.tenantId` provided -> emit to socket room `tenant:${tenantId}`.
 * Otherwise emits to all connected sockets (useful for admin).
 */
export function pushEvent(eventName, payload = {}, opts = {}) {
  if (!io) {
    console.warn("pushEvent: realtime not initialized, skipping", eventName);
    return;
  }

  if (opts.phone) {
    io.to(`phone:${opts.phone}`).emit(eventName, payload);
  }

  if (opts.tenantId) {
    io.to(`tenant:${opts.tenantId}`).emit(eventName, payload);
  }

  // Always emit a tenant-wide broadcast too if requested
  if (!opts.phone && !opts.tenantId) {
    io.emit(eventName, payload);
  }
}

/**
 * Return io instance (for direct use if needed)
 */
export function getIo() {
  return io;
}

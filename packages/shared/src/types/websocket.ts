// WebSocket message types
export interface WsMessage<T = unknown> {
  action: string;
  payload: T;
}

// Example WebSocket actions - replace with your own
export interface WsChatMessage extends WsMessage<{
  message: string;
  roomId: string;
}> {
  action: "chat";
}

export interface WsPresenceMessage extends WsMessage<{
  status: "online" | "offline";
}> {
  action: "presence";
}

export type WsIncomingMessage = WsChatMessage | WsPresenceMessage;

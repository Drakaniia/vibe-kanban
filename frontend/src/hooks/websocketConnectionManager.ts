/**
 * WebSocket Connection Manager
 * Implements connection deduplication to prevent multiple WebSocket connections to the same endpoint
 */

type WsMessageHandler = (event: MessageEvent) => void;
type WsOpenHandler = () => void;
type WsCloseHandler = (event: CloseEvent) => void;
type WsErrorHandler = () => void;

interface ManagedConnection {
  ws: WebSocket;
  refCount: number;
  messageHandlers: Set<WsMessageHandler>;
  openHandlers: Set<WsOpenHandler>;
  closeHandlers: Set<WsCloseHandler>;
  errorHandlers: Set<WsErrorHandler>;
  isClosing: boolean;
}

class WebSocketConnectionManager {
  private connections = new Map<string, ManagedConnection>();

  /**
   * Get or create a shared WebSocket connection for the given endpoint
   */
  connect(
    endpoint: string,
    handlers: {
      onMessage?: WsMessageHandler;
      onOpen?: WsOpenHandler;
      onClose?: WsCloseHandler;
      onError?: WsErrorHandler;
    }
  ): () => void {
    let connection = this.connections.get(endpoint);

    // Create new connection if it doesn't exist
    if (!connection || connection.isClosing) {
      const ws = new WebSocket(endpoint);

      connection = {
        ws,
        refCount: 0,
        messageHandlers: new Set(),
        openHandlers: new Set(),
        closeHandlers: new Set(),
        errorHandlers: new Set(),
        isClosing: false,
      };

      // Set up WebSocket event handlers that delegate to registered handlers
      ws.onopen = () => {
        connection!.openHandlers.forEach((handler) => handler());
      };

      ws.onmessage = (event) => {
        connection!.messageHandlers.forEach((handler) => handler(event));
      };

      ws.onerror = () => {
        connection!.errorHandlers.forEach((handler) => handler());
      };

      ws.onclose = (event) => {
        // Notify all handlers
        connection!.closeHandlers.forEach((handler) => handler(event));

        // Clean up connection from map
        this.connections.delete(endpoint);
      };

      this.connections.set(endpoint, connection);
    }

    // Register handlers
    if (handlers.onMessage) {
      connection.messageHandlers.add(handlers.onMessage);
    }
    if (handlers.onOpen) {
      connection.openHandlers.add(handlers.onOpen);
    }
    if (handlers.onClose) {
      connection.closeHandlers.add(handlers.onClose);
    }
    if (handlers.onError) {
      connection.errorHandlers.add(handlers.onError);
    }

    // Increment reference count
    connection.refCount++;

    // Return disconnect function
    return () => {
      const conn = this.connections.get(endpoint);
      if (!conn) return;

      // Remove handlers
      if (handlers.onMessage) {
        conn.messageHandlers.delete(handlers.onMessage);
      }
      if (handlers.onOpen) {
        conn.openHandlers.delete(handlers.onOpen);
      }
      if (handlers.onClose) {
        conn.closeHandlers.delete(handlers.onClose);
      }
      if (handlers.onError) {
        conn.errorHandlers.delete(handlers.onError);
      }

      // Decrement reference count
      conn.refCount--;

      // Close connection if no more references
      if (conn.refCount <= 0 && !conn.isClosing) {
        conn.isClosing = true;
        conn.ws.close();
      }
    };
  }

  /**
   * Close a specific connection by endpoint
   */
  disconnect(endpoint: string): void {
    const connection = this.connections.get(endpoint);
    if (connection && !connection.isClosing) {
      connection.isClosing = true;
      connection.ws.close();
    }
  }

  /**
   * Close all connections
   */
  disconnectAll(): void {
    this.connections.forEach((connection) => {
      if (!connection.isClosing) {
        connection.isClosing = true;
        connection.ws.close();
      }
    });
    this.connections.clear();
  }
}

// Export singleton instance
export const wsConnectionManager = new WebSocketConnectionManager();
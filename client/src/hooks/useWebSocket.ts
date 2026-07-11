import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutgoingMessage, WsMessage } from '@chaos-parcel/shared';
import { serializeMessage } from '@chaos-parcel/shared';
import { resolveWsUrl } from '../config';

interface UseWebSocketOptions {
  role?: 'host' | 'player';
  onMessage?: (message: WsMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
}

const RECONNECT_MS = 1500;

export function useWebSocket({ role = 'player', onMessage, onOpen, onClose }: UseWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const unmountedRef = useRef(false);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const existing = wsRef.current;
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return;
    }

    clearReconnectTimer();

    const url = `${resolveWsUrl()}?role=${role}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (unmountedRef.current) return;
      setConnected(true);
      setError(null);
      onOpenRef.current?.();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as WsMessage;
        if (data.event === 'ERROR') {
          setError(data.payload.message);
        }
        onMessageRef.current?.(data);
      } catch {
        setError('שגיאה בפענוח הודעה מהשרת');
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
      setConnected(false);
      onCloseRef.current?.();

      if (!unmountedRef.current) {
        clearReconnectTimer();
        reconnectTimerRef.current = setTimeout(() => connect(), RECONNECT_MS);
      }
    };

    ws.onerror = () => {
      if (!unmountedRef.current) {
        setError('לא ניתן להתחבר לשרת. ודא שהמחשב והטלפון על אותה רשת Wi‑Fi');
      }
    };
  }, [role, clearReconnectTimer]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      clearReconnectTimer();
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
    };
  }, [connect, clearReconnectTimer]);

  // Phone unlock / return to browser — force a reconnect if the socket died quietly.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || unmountedRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
        connect();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, [connect]);

  const send = useCallback((message: OutgoingMessage | Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(serializeMessage(message as WsMessage));
      return true;
    }
    return false;
  }, []);

  return {
    connected,
    error,
    send,
    reconnect: connect,
    clearError: () => setError(null),
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutgoingMessage, WsMessage } from '@chaos-parcel/shared';
import { serializeMessage } from '@chaos-parcel/shared';
import { WS_URL } from '../config';

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

  onMessageRef.current = onMessage;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const existing = wsRef.current;
    if (existing?.readyState === WebSocket.OPEN || existing?.readyState === WebSocket.CONNECTING) {
      return;
    }

    const url = `${WS_URL}?role=${role}`;
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
        setTimeout(() => connect(), RECONNECT_MS);
      }
    };

    ws.onerror = () => {
      if (!unmountedRef.current) {
        setError('לא ניתן להתחבר לשרת. ודא ש-pnpm dev:server רץ על פורט 3001');
      }
    };
  }, [role]);

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      const ws = wsRef.current;
      wsRef.current = null;
      ws?.close();
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

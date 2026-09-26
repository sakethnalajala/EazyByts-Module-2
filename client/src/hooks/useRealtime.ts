import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Notification } from '@smd/shared';
import { getAccessToken } from '@/lib/apiClient';
import { useAuthStore } from '@/stores/authStore';
import { queryKeys } from '@/lib/queries';

/**
 * Socket.IO connection for push notifications.
 *
 * Only event-driven things arrive here - alerts firing, orders filling. Prices
 * are polled from the server's cached quote endpoint instead, because streaming
 * them would multiply upstream provider calls without making delayed data any
 * less delayed.
 *
 * The app remains fully functional if this never connects: every socket event
 * also has a polling fallback, which matters on a free-tier host that drops
 * idle connections.
 */
export function useRealtime(): void {
  const queryClient = useQueryClient();
  const status = useAuthStore((state) => state.status);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (status !== 'authed') return;

    const token = getAccessToken();
    if (!token) return;

    const socket = io({
      path: '/api/v1/socket.io',
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2_000,
      // Avoid a second connection when React StrictMode double-invokes effects.
      forceNew: false,
    });

    socketRef.current = socket;

    socket.on('notification:new', (notification: Notification) => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.unreadCount });

      toast(notification.title, {
        description: notification.body,
        duration: 6_000,
      });
    });

    socket.on('order:updated', () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    });

    socket.on('alert:triggered', () => {
      void queryClient.invalidateQueries({ queryKey: ['alerts'] });
    });

    // Connection failures are expected on a sleeping free-tier host and must
    // not surface as an error to the user - polling covers it.
    socket.on('connect_error', () => undefined);

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, queryClient]);
}

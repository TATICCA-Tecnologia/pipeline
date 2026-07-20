"use client";

import { useRouter } from "next/navigation";
import { trpc } from "@/shared/trpc/client";
import { Button } from "@/src/shared/components/ui/button";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import { Bell } from "lucide-react";
import { cn } from "@/src/shared/utils";

export function NotificationBell() {
  const router = useRouter();
  const utils = trpc.useUtils();

  const { data: unreadCount = 0 } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const { data: notifications = [] } = trpc.notification.list.useQuery();

  const markAsReadMutation = trpc.notification.markAsRead.useMutation({
    onSuccess: () => {
      utils.notification.unreadCount.invalidate();
      utils.notification.list.invalidate();
    },
  });

  function handleSelect(notification: { id: string; link: string | null; read: boolean }) {
    if (!notification.read) {
      markAsReadMutation.mutate({ id: notification.id });
    }
    if (notification.link) {
      router.push(notification.link);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-8 w-8 shrink-0"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px]">
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="start">
        <DropdownMenuLabel>Notificações</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-2 py-3 text-center text-sm text-muted-foreground">
            Nenhuma notificação ainda
          </p>
        ) : (
          notifications.map((notification) => (
            <DropdownMenuItem
              key={notification.id}
              onClick={() => handleSelect(notification)}
              className={cn(
                "flex flex-col items-start gap-0.5 whitespace-normal py-2",
                !notification.read && "bg-accent/50"
              )}
            >
              <span className="text-sm font-medium">{notification.title}</span>
              <span className="text-xs text-muted-foreground">{notification.message}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

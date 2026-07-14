"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/shared/context/auth-context";
import { useComments } from "@/shared/context/comments-context";
import { Button } from "@/src/shared/components/ui/button";
import { Textarea } from "@/src/shared/components/ui/textarea";
import { ScrollArea } from "@/src/shared/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/src/shared/components/ui/avatar";
import { Badge } from "@/src/shared/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/shared/components/ui/dropdown-menu";
import { cn } from "@/src/shared/utils";
import { Send, MoreVertical, Pencil, Trash2, Globe, Lock } from "lucide-react";
import type { Comment, CommentVisibility } from "@/shared/types";

interface ProjectChatProps {
  projectId: string;
}

type ChatTab = "global" | "internal";

export function ProjectChat({ projectId }: ProjectChatProps) {
  const { user } = useAuth();
  const { comments, addComment, updateComment, deleteComment } = useComments(projectId);

  const isClient = user?.role === "client";
  const canSeeInternal = user?.role === "admin" || user?.role === "developer";

  const [activeTab, setActiveTab] = useState<ChatTab>("global");
  const [newMessage, setNewMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const globalComments = comments.filter((c) => c.visibility === "GLOBAL");
  const internalComments = comments.filter((c) => c.visibility === "INTERNAL");
  const visibleComments = activeTab === "global" ? globalComments : internalComments;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [visibleComments.length, activeTab]);

  function handleSendMessage() {
    if (!newMessage.trim() || !user) return;
    const visibility: CommentVisibility = activeTab === "internal" ? "INTERNAL" : "GLOBAL";
    addComment({
      projectId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      content: newMessage.trim(),
      visibility,
    }).catch(() => {});
    setNewMessage("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  function handleStartEdit(comment: Comment) {
    setEditingId(comment.id);
    setEditContent(comment.content);
  }

  function handleSaveEdit() {
    if (!editingId || !editContent.trim()) return;
    updateComment(editingId, editContent.trim());
    setEditingId(null);
    setEditContent("");
  }

  function handleCancelEdit() {
    setEditingId(null);
    setEditContent("");
  }

  function formatTime(date: Date) {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Agora";
    if (minutes < 60) return `${minutes}min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return new Date(date).toLocaleDateString("pt-BR");
  }

  function getRoleBadge(role: string) {
    switch (role) {
      case "admin":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "developer":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "client":
        return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
      default:
        return "bg-muted text-muted-foreground";
    }
  }

  function getRoleLabel(role: string) {
    if (role === "admin") return "Admin";
    if (role === "developer") return "Dev";
    return "Cliente";
  }

  const renderMessages = (msgs: Comment[]) => {
    if (msgs.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          {activeTab === "global" ? (
            <Globe className="mb-2 h-10 w-10 text-muted-foreground/40" />
          ) : (
            <Lock className="mb-2 h-10 w-10 text-muted-foreground/40" />
          )}
          <p className="text-sm text-muted-foreground">Nenhuma mensagem ainda</p>
          <p className="text-xs text-muted-foreground">
            {activeTab === "global"
              ? "Seja o primeiro a comentar!"
              : "Use este canal para comunicação interna da equipe."}
          </p>
        </div>
      );
    }

    return msgs.map((comment) => {
      const isOwn = comment.userId === user?.id;
      const isEditing = editingId === comment.id;

      return (
        <div key={comment.id} className={cn("flex gap-3", isOwn && "flex-row-reverse")}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-xs bg-secondary">
              {comment.userName.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </AvatarFallback>
          </Avatar>

          <div className={cn("flex-1 max-w-[80%]", isOwn && "flex flex-col items-end")}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">
                {isOwn ? "Você" : comment.userName}
              </span>
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1 py-0 h-4 border", getRoleBadge(comment.userRole))}
              >
                {getRoleLabel(comment.userRole)}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTime(comment.createdAt)}
                {comment.updatedAt && " (editado)"}
              </span>
            </div>

            <div
              className={cn(
                "rounded-lg px-3 py-2 relative group",
                isOwn ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"
              )}
            >
              {isEditing ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-[60px] bg-background text-foreground"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={handleCancelEdit}>Cancelar</Button>
                    <Button size="sm" onClick={handleSaveEdit}>Salvar</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                  {isOwn && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity",
                            isOwn
                              ? "bg-primary-foreground/10 hover:bg-primary-foreground/20"
                              : "bg-secondary-foreground/10 hover:bg-secondary-foreground/20"
                          )}
                        >
                          <MoreVertical className="h-3 w-3" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleStartEdit(comment)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteComment(comment.id)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-[500px] border border-border rounded-lg bg-card">
      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab("global")}
          className={cn(
            "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
            activeTab === "global"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Globe className="h-4 w-4" />
          Chat do Projeto
          {globalComments.length > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{globalComments.length}</span>
          )}
        </button>

        {canSeeInternal && (
          <button
            onClick={() => setActiveTab("internal")}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
              activeTab === "internal"
                ? "border-b-2 border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Lock className="h-4 w-4" />
            Chat de Execução
            {internalComments.length > 0 && (
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs">{internalComments.length}</span>
            )}
          </button>
        )}
      </div>

      {/* Descrição do canal ativo */}
      {activeTab === "internal" && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20">
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Lock className="h-3 w-3" />
            Canal interno — visível apenas para admin e desenvolvedores
          </p>
        </div>
      )}

      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">{renderMessages(visibleComments)}</div>
      </ScrollArea>

      {/* Input — cliente não pode enviar no canal de execução */}
      {(!isClient || activeTab === "global") ? (
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <Textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeTab === "internal"
                  ? "Mensagem interna (equipe)..."
                  : "Digite sua mensagem..."
              }
              className="min-h-[44px] max-h-[120px] resize-none"
              rows={1}
            />
            <Button onClick={handleSendMessage} disabled={!newMessage.trim()} size="icon" className="shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Enter para enviar · Shift+Enter para nova linha
          </p>
        </div>
      ) : null}
    </div>
  );
}

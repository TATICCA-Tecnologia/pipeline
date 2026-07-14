"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import type { Comment, CommentVisibility } from "@/shared/types";
import { trpc } from "@/shared/trpc/client";

interface CommentsContextType {
  getCommentsByProject: (projectId: string) => Comment[];
  addComment: (
    comment: Omit<Comment, "id" | "createdAt"> & {
      visibility?: CommentVisibility;
      isIncident?: boolean;
    }
  ) => Promise<void>;
  updateComment: (id: string, content: string) => void;
  deleteComment: (id: string) => void;
}

const CommentsContext = createContext<CommentsContextType | undefined>(undefined);

export function CommentsProvider({ children }: { children: ReactNode }) {
  const utils = trpc.useUtils();
  const createComment = trpc.comment.create.useMutation({
    onSuccess: () => utils.comment.byProject.invalidate(),
    onError: (err) =>
      toast.error("Não foi possível enviar a mensagem", {
        description: err.message,
      }),
  });
  const updateCommentMutation = trpc.comment.update.useMutation({
    onSuccess: () => utils.comment.byProject.invalidate(),
    onError: (err) =>
      toast.error("Não foi possível editar a mensagem", {
        description: err.message,
      }),
  });
  const deleteCommentMutation = trpc.comment.delete.useMutation({
    onSuccess: () => utils.comment.byProject.invalidate(),
    onError: (err) =>
      toast.error("Não foi possível excluir a mensagem", {
        description: err.message,
      }),
  });

  const getCommentsByProject = useCallback(
    (_projectId: string) => [] as Comment[],
    []
  );
  const addComment = useCallback(
    async (
      comment: Omit<Comment, "id" | "createdAt"> & {
        visibility?: CommentVisibility;
        isIncident?: boolean;
      }
    ) => {
      await createComment.mutateAsync({
        projectId: comment.projectId,
        content: comment.content,
        visibility: comment.visibility ?? "GLOBAL",
        isIncident: comment.isIncident ?? false,
      });
    },
    [createComment]
  );
  const updateComment = useCallback(
    (id: string, content: string) => {
      updateCommentMutation.mutate({ id, content });
    },
    [updateCommentMutation]
  );
  const deleteComment = useCallback(
    (id: string) => {
      deleteCommentMutation.mutate({ id });
    },
    [deleteCommentMutation]
  );

  return (
    <CommentsContext.Provider
      value={{
        getCommentsByProject,
        addComment,
        updateComment,
        deleteComment,
      }}
    >
      {children}
    </CommentsContext.Provider>
  );
}

function mapComment(c: Record<string, unknown>): Comment {
  return {
    id: c.id as string,
    projectId: c.projectId as string,
    userId: c.userId as string,
    userName: c.userName as string,
    userRole: c.userRole as Comment["userRole"],
    content: c.content as string,
    visibility: (c.visibility as CommentVisibility) ?? "GLOBAL",
    isIncident: (c.isIncident as boolean) ?? false,
    createdAt: c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt as string),
    updatedAt: c.updatedAt
      ? c.updatedAt instanceof Date
        ? c.updatedAt
        : new Date(c.updatedAt as string)
      : undefined,
  };
}

export function useComments(projectId?: string) {
  const context = useContext(CommentsContext);
  if (context === undefined) {
    throw new Error("useComments deve ser usado dentro de CommentsProvider");
  }
  const { data: commentsData = [] } = trpc.comment.byProject.useQuery(
    { projectId: projectId ?? "", visibility: "ALL" },
    { enabled: !!projectId }
  );
  const comments: Comment[] = Array.isArray(commentsData)
    ? (commentsData as Array<Record<string, unknown>>).map(mapComment)
    : [];

  return {
    ...context,
    comments: projectId ? comments : [],
    getCommentsByProject: (pid: string) => (pid === projectId ? comments : context.getCommentsByProject(pid)),
  };
}

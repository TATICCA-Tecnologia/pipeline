import type { ProjectStatus as PrismaProjectStatus, UserRole as PrismaUserRole } from "@prisma/client";

export type FrontendProjectStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "completed"
  | "cancelled";

const PRISMA_TO_FRONTEND_STATUS: Record<PrismaProjectStatus, FrontendProjectStatus> = {
  BACKLOG: "backlog",
  TODO: "todo",
  IN_PROGRESS: "in-progress",
  IN_REVIEW: "review",
  DONE: "completed",
  CANCELLED: "cancelled",
};

const FRONTEND_TO_PRISMA_STATUS: Record<FrontendProjectStatus, PrismaProjectStatus> = {
  backlog: "BACKLOG",
  todo: "TODO",
  "in-progress": "IN_PROGRESS",
  review: "IN_REVIEW",
  completed: "DONE",
  cancelled: "CANCELLED",
};

export type FrontendUserRole = "client" | "developer" | "admin" | "super_admin";

const PRISMA_TO_FRONTEND_ROLE: Record<PrismaUserRole, FrontendUserRole> = {
  CLIENT: "client",
  DEVELOPER: "developer",
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
};

/** Roles atribuíveis na criação de um usuário — super_admin só via promoção explícita. */
export type CreatableUserRole = "client" | "developer" | "admin";

const CREATABLE_TO_PRISMA_ROLE: Record<CreatableUserRole, PrismaUserRole> = {
  client: "CLIENT",
  developer: "DEVELOPER",
  admin: "ADMIN",
};

export function toPrismaRole(role: CreatableUserRole): PrismaUserRole {
  return CREATABLE_TO_PRISMA_ROLE[role];
}

export function toFrontendStatus(status: PrismaProjectStatus): FrontendProjectStatus {
  return PRISMA_TO_FRONTEND_STATUS[status];
}

export function toPrismaStatus(status: FrontendProjectStatus): PrismaProjectStatus {
  return FRONTEND_TO_PRISMA_STATUS[status];
}

export function toFrontendRole(role: PrismaUserRole): FrontendUserRole {
  return PRISMA_TO_FRONTEND_ROLE[role];
}

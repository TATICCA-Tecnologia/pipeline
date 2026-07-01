// Tipos de usuário
export type UserRole = "client" | "developer" | "admin" | "super_admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  company?: string;
  createdAt: Date;
}

// Status do projeto
export type ProjectStatus =
  | "backlog"
  | "todo"
  | "in-progress"
  | "review"
  | "completed";

// Prioridade do projeto
export type Priority = "low" | "medium" | "high" | "urgent";

// Projeto
export interface Project {
  id: string;
  title: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  clientId: string;
  developerId?: string;
  estimatedDeadline?: Date;
  estimatedBudget?: number;
  projectType: string;
  targetAudience?: string;
  expectedUsers?: string;
  urgency?: string;
  features?: string[];
  // Campos da solicitação detalhada
  additionalInfo?: string;
  hasExistingSystem?: string;
  existingSystemDetails?: string;
  projectNarrative?: string;
  benefits?: string[];
  benefitsDetails?: string;
  monthlyHoursSaved?: number;
  ratingErrorReduction?: number;
  ratingProcessCriticality?: number;
  ratingInternalImpact?: number;
  ratingExternalImpact?: number;
  ratingCompliance?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Tarefa dentro de um projeto
export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: ProjectStatus;
  assignedTo?: string;
  timeSpent?: number; // em minutos
  createdAt: Date;
  updatedAt: Date;
}

// Arquivo do projeto
export interface ProjectFile {
  id: string;
  projectId: string;
  name: string;
  url: string;
  type: string;
  size: number;
  uploadedBy: string;
  createdAt: Date;
}

// Histórico de alterações
export interface ActivityLog {
  id: string;
  projectId: string;
  userId: string;
  action: string;
  details?: string;
  createdAt: Date;
}

// Comentário do projeto
export type CommentVisibility = "GLOBAL" | "INTERNAL";

export interface Comment {
  id: string;
  projectId: string;
  userId: string;
  userName: string;
  userRole: UserRole;
  content: string;
  visibility: CommentVisibility;
  attachments?: ProjectFile[];
  createdAt: Date;
  updatedAt?: Date;
}

// Notificação
export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: "info" | "success" | "warning";
  createdAt: Date;
}

// Solicitação de projeto (formulário da landing page)
export interface ProjectRequest {
  id: string;
  name: string;
  email: string;
  company?: string;
  projectType: string;
  description: string;
  estimatedDeadline?: string;
  estimatedBudget?: string;
  files?: string[];
  createdAt: Date;
}

// Fase de especificação de projeto
export interface PhaseTask {
  id: string;
  title: string;
  description?: string;
  estimatedHours: number;
  hoursWorked: number;
  order: number;
  completedAt?: Date | string;
  assigneeId?: string;
  phaseId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectPhase {
  id: string;
  name: string;
  description?: string;
  order: number;
  estimatedHours: number;
  projectId: string;
  tasks: PhaseTask[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AISuggestedTask {
  title: string;
  description: string;
  estimatedHours: number;
}

export interface AISuggestedPhase {
  name: string;
  description: string;
  estimatedHours: number;
  tasks: AISuggestedTask[];
}

// Configurações do Kanban
export const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; color: string }
> = {
  backlog: { label: "Backlog", color: "bg-muted" },
  todo: { label: "Arquitetura", color: "bg-blue-500/20" },
  "in-progress": { label: "Em Desenvolvimento", color: "bg-green-500/50" },
  review: { label: "Em Revisão", color: "bg-yellow-500/50" },
  completed: { label: "Concluído", color: "bg-emerald-500/20" },
};

export const PRIORITY_CONFIG: Record<
  Priority,
  { label: string; color: string }
> = {
  low: { label: "Baixa", color: "text-muted-foreground" },
  medium: { label: "Média", color: "text-amber-500" },
  high: { label: "Alta", color: "text-destructive" },
  urgent: { label: "Urgente", color: "text-destructive font-semibold" },
};


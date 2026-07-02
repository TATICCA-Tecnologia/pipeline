"use client";

import {
  createContext,
  useContext,
  useCallback,
  type ReactNode,
} from "react";
import type {
  Project,
  ProjectStatus,
  Priority,
  ProjectRequest,
  ActivityLog,
} from "@/shared/types";
import { trpc } from "@/shared/trpc/client";
import { useAuth } from "@/shared/context/auth-context";

interface ProjectsContextType {
  projects: Project[];
  requests: ProjectRequest[];
  activityLogs: ActivityLog[];
  isLoading: boolean;
  addProject: (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => Promise<string>;
  updateProject: (id: string, updates: Partial<Project>) => void;
  moveProject: (id: string, status: ProjectStatus) => void;
  addRequest: (request: Omit<ProjectRequest, "id" | "createdAt">) => void;
  approveRequest: (requestId: string, developerId?: string) => void;
  getProjectsByStatus: (status: ProjectStatus) => Project[];
  getProjectsByClient: (clientId: string) => Project[];
  getProjectsByDeveloper: (developerId: string) => Project[];
  refetch: () => void;
}

const ProjectsContext = createContext<ProjectsContextType | undefined>(
  undefined
);

function mapProject(p: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  clientId: string;
  developerId?: string | null;
  companyId?: string | null;
  companyName?: string | null;
  projectType: string;
  estimatedDeadline?: Date | null;
  targetAudience?: string | null;
  expectedUsers?: string | null;
  urgency?: string | null;
  features?: string[] | null;
  additionalInfo?: string | null;
  hasExistingSystem?: string | null;
  existingSystemDetails?: string | null;
  hasCurrentApplication?: string | null;
  currentApplicationDetails?: string | null;
  projectNarrative?: string | null;
  benefits?: string[] | null;
  benefitsDetails?: string | null;
  monthlyHoursSaved?: number | null;
  ratingErrorReduction?: number | null;
  ratingProcessCriticality?: number | null;
  ratingInternalImpact?: number | null;
  ratingExternalImpact?: number | null;
  ratingCompliance?: number | null;
  peopleInvolved?: number | null;
  peopleInvolvedDetails?: string | null;
  taskDurationHours?: number | null;
  processFrequency?: string | null;
  currentAnnualHours?: number | null;
  complexity?: string | null;
  robotSchedule?: string | null;
  estimatedAnnualSavingBRL?: number | null;
  createdAt: Date;
  updatedAt: Date;
}): Project {
  return {
    id: p.id,
    title: p.title,
    description: p.description ?? "",
    status: p.status as ProjectStatus,
    priority: p.priority as Priority,
    clientId: p.clientId,
    developerId: p.developerId ?? undefined,
    companyId: p.companyId ?? undefined,
    companyName: p.companyName ?? undefined,
    projectType: p.projectType,
    estimatedDeadline: p.estimatedDeadline ?? undefined,
    targetAudience: p.targetAudience ?? undefined,
    expectedUsers: p.expectedUsers ?? undefined,
    urgency: p.urgency ?? undefined,
    features: p.features ?? [],
    additionalInfo: p.additionalInfo ?? undefined,
    hasExistingSystem: p.hasExistingSystem ?? undefined,
    existingSystemDetails: p.existingSystemDetails ?? undefined,
    hasCurrentApplication: p.hasCurrentApplication ?? undefined,
    currentApplicationDetails: p.currentApplicationDetails ?? undefined,
    projectNarrative: p.projectNarrative ?? undefined,
    benefits: p.benefits ?? undefined,
    benefitsDetails: p.benefitsDetails ?? undefined,
    monthlyHoursSaved: p.monthlyHoursSaved ?? undefined,
    ratingErrorReduction: p.ratingErrorReduction ?? undefined,
    ratingProcessCriticality: p.ratingProcessCriticality ?? undefined,
    ratingInternalImpact: p.ratingInternalImpact ?? undefined,
    ratingExternalImpact: p.ratingExternalImpact ?? undefined,
    ratingCompliance: p.ratingCompliance ?? undefined,
    peopleInvolved: p.peopleInvolved ?? undefined,
    peopleInvolvedDetails: p.peopleInvolvedDetails ?? undefined,
    taskDurationHours: p.taskDurationHours ?? undefined,
    processFrequency: p.processFrequency ?? undefined,
    currentAnnualHours: p.currentAnnualHours ?? undefined,
    complexity: p.complexity ?? undefined,
    robotSchedule: p.robotSchedule ?? undefined,
    estimatedAnnualSavingBRL: p.estimatedAnnualSavingBRL ?? undefined,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const { data: projectsData = [], isLoading } = trpc.project.list.useQuery(
    user?.role === "client" ? { clientId: user.id } : undefined
  );
  const {
    data: requestsData = [],
    isError: requestsError,
  } = trpc.request.list.useQuery(undefined, {
    enabled: !!user?.id,
    retry: false,
  });

  const createProject = trpc.project.create.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
  const updateProjectMutation = trpc.project.update.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
  const moveProjectMutation = trpc.project.move.useMutation({
    onSuccess: () => utils.project.list.invalidate(),
  });
  const createRequest = trpc.request.create.useMutation({
    onSuccess: () => utils.request.list.invalidate(),
  });
  const approveRequestMutation = trpc.request.approve.useMutation({
    onSuccess: () => {
      utils.project.list.invalidate();
      utils.request.list.invalidate();
    },
  });

  const projects: Project[] = Array.isArray(projectsData)
    ? projectsData.map((p: Record<string, unknown>) => mapProject(p as Parameters<typeof mapProject>[0]))
    : [];
  const requests: ProjectRequest[] = !requestsError && Array.isArray(requestsData)
    ? requestsData.map((r: Record<string, unknown>) => ({
    id: r.id as string,
    name: r.name as string,
    email: r.email as string,
    company: r.company as string | undefined,
    projectType: r.projectType as string,
    description: r.description as string,
    estimatedDeadline: r.estimatedDeadline as string | undefined,
    estimatedBudget: r.estimatedBudget as string | undefined,
    createdAt: r.createdAt as Date,
  }))
    : [];
  const activityLogs: ActivityLog[] = [];

  const addProject = useCallback(
    async (project: Omit<Project, "id" | "createdAt" | "updatedAt">) => {
      const created = await createProject.mutateAsync({
        title: project.title,
        description: project.description,
        status: project.status,
        priority: project.priority === "urgent" ? "urgent" : project.priority,
        clientId: project.clientId,
        developerId: project.developerId,
        companyId: project.companyId,
        projectType: project.projectType?.trim() || "Outro",
        estimatedDeadline: project.estimatedDeadline,
        targetAudience: project.targetAudience,
        expectedUsers: project.expectedUsers,
        urgency: project.urgency,
        features: project.features,
        additionalInfo: project.additionalInfo,
        hasExistingSystem: project.hasExistingSystem,
        existingSystemDetails: project.existingSystemDetails,
        hasCurrentApplication: project.hasCurrentApplication,
        currentApplicationDetails: project.currentApplicationDetails,
        projectNarrative: project.projectNarrative,
        benefits: project.benefits,
        benefitsDetails: project.benefitsDetails,
        monthlyHoursSaved: project.monthlyHoursSaved,
        ratingErrorReduction: project.ratingErrorReduction,
        ratingProcessCriticality: project.ratingProcessCriticality,
        ratingInternalImpact: project.ratingInternalImpact,
        ratingExternalImpact: project.ratingExternalImpact,
        ratingCompliance: project.ratingCompliance,
        peopleInvolved: project.peopleInvolved,
        peopleInvolvedDetails: project.peopleInvolvedDetails,
        taskDurationHours: project.taskDurationHours,
        processFrequency: project.processFrequency,
      });
      return created.id as string;
    },
    [createProject]
  );

  const updateProject = useCallback(
    (id: string, updates: Partial<Project>) => {
      updateProjectMutation.mutate({
        id,
        title: updates.title,
        description: updates.description,
        status: updates.status,
        priority: updates.priority,
        developerId: updates.developerId,
        estimatedDeadline: updates.estimatedDeadline,
      });
    },
    [updateProjectMutation]
  );

  const moveProject = useCallback(
    (id: string, status: ProjectStatus) => {
      moveProjectMutation.mutate({ id, status });
    },
    [moveProjectMutation]
  );

  const addRequest = useCallback(
    (request: Omit<ProjectRequest, "id" | "createdAt">) => {
      createRequest.mutate({
        name: request.name,
        email: request.email,
        company: request.company,
        projectType: request.projectType,
        description: request.description,
        estimatedDeadline: request.estimatedDeadline,
        estimatedBudget: request.estimatedBudget,
      });
    },
    [createRequest]
  );

  const approveRequest = useCallback(
    (requestId: string, developerId?: string) => {
      approveRequestMutation.mutate({ requestId, developerId });
    },
    [approveRequestMutation]
  );

  const getProjectsByStatus = useCallback(
    (status: ProjectStatus) => projects.filter((p) => p.status === status),
    [projects]
  );

  const getProjectsByClient = useCallback(
    (clientId: string) => projects.filter((p) => p.clientId === clientId),
    [projects]
  );

  const getProjectsByDeveloper = useCallback(
    (developerId: string) =>
      projects.filter((p) => p.developerId === developerId),
    [projects]
  );

  const refetch = useCallback(() => {
    void utils.project.list.invalidate();
    void utils.request.list.invalidate();
  }, [utils]);

  return (
    <ProjectsContext.Provider
      value={{
        projects,
        requests,
        activityLogs,
        isLoading,
        addProject,
        updateProject,
        moveProject,
        addRequest,
        approveRequest,
        getProjectsByStatus,
        getProjectsByClient,
        getProjectsByDeveloper,
        refetch,
      }}
    >
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (context === undefined) {
    throw new Error("useProjects deve ser usado dentro de um ProjectsProvider");
  }
  return context;
}

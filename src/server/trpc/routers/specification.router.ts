import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, adminProcedure } from "../trpc";
import type { Context } from "../context";
import OpenAI from "openai";

const GROK_MODEL = "grok-4-latest";

function getGrokClient() {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "XAI_API_KEY não está definida no .env. Reinicie o servidor após adicionar.",
    });
  }
  return new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1" });
}

// Permite ADMIN ou o próprio assignee a alterar progresso/horas da tarefa
async function assertAdminOrAssignee(
  ctx: Context & { userId: string },
  taskId: string
) {
  const [user, task] = await Promise.all([
    ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { role: true } }),
    ctx.db.phaseTask.findUnique({ where: { id: taskId }, select: { assigneeId: true } }),
  ]);
  if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Tarefa não encontrada" });
  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isAssignee = task.assigneeId === ctx.userId;
  if (!isAdmin && !isAssignee) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Apenas o administrador ou o responsável pode alterar esta tarefa",
    });
  }
}

export const specificationRouter = router({
  // Busca todas as fases de um projeto com suas tarefas
  getByProject: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ ctx, input }) => {
      const phases = await ctx.db.projectPhase.findMany({
        where: { projectId: input.projectId },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          tasks: {
            include: {
              assignee: { select: { id: true, name: true, email: true } },
            },
            orderBy: { order: "asc" },
          },
        },
        orderBy: { order: "asc" },
      });
      return phases;
    }),

  // Cria uma nova fase
  createPhase: adminProcedure
    .input(
      z.object({
        projectId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        estimatedHours: z.number().min(0).default(0),
        order: z.number().int().default(0),
        assignedToId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const phase = await ctx.db.projectPhase.create({
        data: {
          projectId: input.projectId,
          name: input.name,
          description: input.description ?? null,
          estimatedHours: input.estimatedHours,
          order: input.order,
          assignedToId: input.assignedToId ?? null,
        },
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          tasks: true,
        },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Fase de especificação criada",
          details: input.name,
        },
      });
      return phase;
    }),

  // Atualiza uma fase
  updatePhase: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        estimatedHours: z.number().min(0).optional(),
        order: z.number().int().optional(),
        assignedToId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const phase = await ctx.db.projectPhase.update({
        where: { id },
        data,
        include: {
          assignedTo: { select: { id: true, name: true, email: true } },
          tasks: true,
        },
      });
      return phase;
    }),

  // Remove uma fase (cascade deleta as tarefas)
  deletePhase: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const phase = await ctx.db.projectPhase.findUnique({
        where: { id: input.id },
      });
      if (!phase) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db.projectPhase.delete({ where: { id: input.id } });
      await ctx.db.activityLog.create({
        data: {
          projectId: phase.projectId,
          userId: ctx.userId,
          action: "Fase removida",
          details: phase.name,
        },
      });
      return { success: true };
    }),

  // Reordena fases (recebe array de ids na ordem desejada)
  reorderPhases: adminProcedure
    .input(z.object({ phaseIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all(
        input.phaseIds.map((id, index) =>
          ctx.db.projectPhase.update({ where: { id }, data: { order: index } })
        )
      );
      return { success: true };
    }),

  // Cria uma tarefa dentro de uma fase
  createTask: adminProcedure
    .input(
      z.object({
        phaseId: z.string(),
        title: z.string().min(1),
        description: z.string().optional(),
        estimatedHours: z.number().min(0).default(0),
        order: z.number().int().default(0),
        assigneeId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const task = await ctx.db.phaseTask.create({
        data: {
          phaseId: input.phaseId,
          title: input.title,
          description: input.description ?? null,
          estimatedHours: input.estimatedHours,
          order: input.order,
          assigneeId: input.assigneeId ?? null,
        },
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      return task;
    }),

  // Atualiza uma tarefa
  updateTask: adminProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).optional(),
        description: z.string().nullable().optional(),
        estimatedHours: z.number().min(0).optional(),
        hoursWorked: z.number().min(0).optional(),
        order: z.number().int().optional(),
        assigneeId: z.string().nullable().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const task = await ctx.db.phaseTask.update({
        where: { id },
        data,
        include: {
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      return task;
    }),

  // Dev registra horas trabalhadas em uma tarefa
  logHours: protectedProcedure
    .input(z.object({ id: z.string(), hoursWorked: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrAssignee(ctx, input.id);
      const task = await ctx.db.phaseTask.update({
        where: { id: input.id },
        data: { hoursWorked: input.hoursWorked },
        include: {
          phase: { select: { projectId: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: task.phase.projectId,
          userId: ctx.userId,
          action: "Horas registradas na tarefa",
          details: `${task.phase.name} → ${task.title}: ${input.hoursWorked}h`,
        },
      });
      return task;
    }),

  // Dev marca tarefa como concluída/pendente
  toggleTaskComplete: protectedProcedure
    .input(z.object({ id: z.string(), completed: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await assertAdminOrAssignee(ctx, input.id);
      const task = await ctx.db.phaseTask.update({
        where: { id: input.id },
        data: { completedAt: input.completed ? new Date() : null },
        include: {
          phase: { select: { projectId: true, name: true } },
        },
      });
      await ctx.db.activityLog.create({
        data: {
          projectId: task.phase.projectId,
          userId: ctx.userId,
          action: input.completed ? "Tarefa de fase concluída" : "Tarefa de fase reaberta",
          details: `${task.phase.name} → ${task.title}`,
        },
      });
      return task;
    }),

  // Remove uma tarefa
  deleteTask: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.phaseTask.delete({ where: { id: input.id } });
      return { success: true };
    }),

  // Sugere fases e tarefas usando Claude AI
  suggestWithAI: adminProcedure
    .input(z.object({ projectId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.projectId },
        select: {
          title: true,
          description: true,
          type: true,
          category: true,
          platform: true,
          targetAudience: true,
          expectedUsers: true,
          urgency: true,
          additionalInfo: true,
        },
      });

      if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });

      const projectInfo = [
        `Título: ${project.title}`,
        project.description ? `Descrição: ${project.description}` : null,
        `Tipo: ${project.platform ?? project.type}`,
        `Categoria: ${project.category}`,
        project.targetAudience ? `Público-alvo: ${project.targetAudience}` : null,
        project.expectedUsers ? `Usuários esperados: ${project.expectedUsers}` : null,
        project.urgency ? `Urgência: ${project.urgency}` : null,
        project.additionalInfo ? `Informações adicionais: ${project.additionalInfo}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const grok = getGrokClient();

      let completion;
      try {
        completion = await grok.chat.completions.create({
          model: GROK_MODEL,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
          {
            role: "system",
            content:
              "Você é um arquiteto de software experiente. Responda sempre em JSON válido, sem markdown e sem comentários, exatamente no formato pedido pelo usuário.",
          },
          {
            role: "user",
            content: `Analise o projeto abaixo e sugira um plano de especificação técnica com fases e tarefas detalhadas, incluindo estimativa de horas para cada item.

PROJETO:
${projectInfo}

Formato de resposta (JSON):
{
  "phases": [
    {
      "name": "Nome da fase",
      "description": "Descrição breve da fase",
      "estimatedHours": 0,
      "tasks": [
        {
          "title": "Título da tarefa",
          "description": "Descrição detalhada do que deve ser feito",
          "estimatedHours": 0
        }
      ]
    }
  ]
}

Diretrizes:
- Crie entre 4 e 7 fases lógicas (ex: Levantamento de Requisitos, Arquitetura, Desenvolvimento Backend, Desenvolvimento Frontend, Testes, Deploy)
- Cada fase deve ter entre 3 e 8 tarefas específicas e acionáveis
- As estimativas de horas devem ser realistas para um desenvolvedor sênior
- O total de horas da fase deve ser igual à soma das tarefas
- Adapte as fases ao tipo e contexto do projeto`,
            },
          ],
        });
      } catch (err) {
        console.error("[suggestWithAI] xAI request failed:", err);
        const msg = err instanceof Error ? err.message : "Erro desconhecido";
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao chamar a API do Grok: ${msg}`,
        });
      }

      const text = completion.choices[0]?.message?.content;
      if (!text) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Resposta inválida da IA" });
      }

      try {
        const cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        const parsed = JSON.parse(cleaned) as {
          phases: Array<{
            name: string;
            description: string;
            estimatedHours: number;
            tasks: Array<{ title: string; description: string; estimatedHours: number }>;
          }>;
        };
        return parsed;
      } catch {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Não foi possível interpretar a sugestão da IA. Tente novamente.",
        });
      }
    }),

  // Aceita as sugestões da IA e cria as fases/tarefas no banco
  acceptAISuggestions: adminProcedure
    .input(
      z.object({
        projectId: z.string(),
        phases: z.array(
          z.object({
            name: z.string(),
            description: z.string(),
            estimatedHours: z.number(),
            tasks: z.array(
              z.object({
                title: z.string(),
                description: z.string(),
                estimatedHours: z.number(),
              })
            ),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Remove fases anteriores se houver
      await ctx.db.projectPhase.deleteMany({ where: { projectId: input.projectId } });

      // Cria novas fases e tarefas
      for (let i = 0; i < input.phases.length; i++) {
        const phaseData = input.phases[i];
        await ctx.db.projectPhase.create({
          data: {
            projectId: input.projectId,
            name: phaseData.name,
            description: phaseData.description,
            estimatedHours: phaseData.estimatedHours,
            order: i,
            tasks: {
              create: phaseData.tasks.map((t, j) => ({
                title: t.title,
                description: t.description,
                estimatedHours: t.estimatedHours,
                order: j,
              })),
            },
          },
        });
      }

      await ctx.db.activityLog.create({
        data: {
          projectId: input.projectId,
          userId: ctx.userId,
          action: "Especificação gerada com IA",
          details: `${input.phases.length} fases criadas`,
        },
      });

      return { success: true };
    }),
});

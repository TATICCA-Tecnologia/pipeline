import { z } from "zod";

const ratingScale = z
  .number()
  .int()
  .min(1)
  .max(5)
  .nullable()
  .default(null);

export const solicitarProjetoSchema = z
  .object({
    title: z.string().min(1, "Informe o nome do processo"),
    projectArea: z.string().min(1, "Selecione a área"),
    customProjectArea: z.string().optional().default(""),
    projectTheme: z.string().min(1, "Selecione o tema"),
    customProjectTheme: z.string().optional().default(""),
    platform: z.string().min(1),
    customPlatform: z.string().optional().default(""),
    description: z.string().min(1, "Descreva o processo"),
    targetAudience: z.string().optional().default(""),
    customTargetAudience: z.string().optional().default(""),
    expectedUsers: z.string().optional().default(""),
    hasExistingSystem: z.string().optional().default(""),
    customHasExistingSystem: z.string().optional().default(""),
    existingSystemDetails: z.string().optional().default(""),
    hasCurrentApplication: z.string().optional().default(""),
    customHasCurrentApplication: z.string().optional().default(""),
    currentApplicationDetails: z.string().optional().default(""),
    peopleInvolved: z.string().optional().default(""),
    taskDurationHours: z.string().optional().default(""),
    processFrequency: z.string().optional().default(""),
    customProcessFrequency: z.string().optional().default(""),
    benefitsDetails: z.string().optional().default(""),
    monthlyHoursSaved: z.string().optional().default(""),
    ratingErrorReduction: ratingScale,
    ratingProcessCriticality: ratingScale,
    ratingInternalImpact: ratingScale,
    ratingExternalImpact: ratingScale,
    ratingCompliance: ratingScale,
    projectNarrative: z.string().optional().default(""),
    urgency: z.string().optional().default(""),
    customUrgency: z.string().optional().default(""),
    deadline: z.string().optional().default(""),
    additionalInfo: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.projectArea === "outro" && !data.customProjectArea.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customProjectArea"],
        message: "Informe qual é a área",
      });
    }
    if (data.projectTheme === "outro" && !data.customProjectTheme.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customProjectTheme"],
        message: "Informe qual é o tema",
      });
    }
    if (data.targetAudience === "outro" && !data.customTargetAudience.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customTargetAudience"],
        message: "Informe qual é o setor envolvido",
      });
    }
    if (data.platform === "outro" && !data.customPlatform.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customPlatform"],
        message: "Informe qual é a plataforma",
      });
    }
    if (data.hasExistingSystem === "outro" && !data.customHasExistingSystem.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customHasExistingSystem"],
        message: "Descreva a situação do processo/sistema atual",
      });
    }
    if (data.hasCurrentApplication === "outro" && !data.customHasCurrentApplication.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customHasCurrentApplication"],
        message: "Descreva a situação da aplicação atual",
      });
    }
    if (data.processFrequency === "outro" && !data.customProcessFrequency.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customProcessFrequency"],
        message: "Informe a periodicidade",
      });
    }
    if (data.urgency === "outro" && !data.customUrgency.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customUrgency"],
        message: "Informe o nível de urgência",
      });
    }
  });

export type SolicitarProjetoFormData = z.infer<typeof solicitarProjetoSchema>;

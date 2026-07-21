import { router, createCallerFactory } from "./trpc";
import { projectRouter } from "./routers/project.router";
import { userRouter } from "./routers/user.router";
import { authRouter } from "./routers/auth.router";
import { requestRouter } from "./routers/request.router";
import { commentRouter } from "./routers/comment.router";
import { fileRouter } from "./routers/file.router";
import { activityRouter } from "./routers/activity.router";
import { featureRouter } from "./routers/feature.router";
import { specificationRouter } from "./routers/specification.router";
import { taxonomyRouter } from "./routers/taxonomy.router";
import { companyRouter } from "./routers/company.router";
import { settingsRouter } from "./routers/settings.router";
import { interviewRouter } from "./routers/interview.router";
import { personRouter } from "./routers/person.router";
import { aiSettingsRouter } from "./routers/ai-settings.router";
import { aiOpportunityRouter } from "./routers/ai-opportunity.router";
import { notificationRouter } from "./routers/notification.router";

export const appRouter = router({
  project: projectRouter,
  user: userRouter,
  auth: authRouter,
  request: requestRouter,
  comment: commentRouter,
  file: fileRouter,
  activity: activityRouter,
  feature: featureRouter,
  specification: specificationRouter,
  taxonomy: taxonomyRouter,
  company: companyRouter,
  settings: settingsRouter,
  interview: interviewRouter,
  person: personRouter,
  aiSettings: aiSettingsRouter,
  aiOpportunity: aiOpportunityRouter,
  notification: notificationRouter,
});

export type AppRouter = typeof appRouter;

// Caller server-side do appRouter: permite invocar os procedures existentes
// fora de uma requisição HTTP (ex.: geração do deck consolidado em PPTX no
// Passo 8a), reaproveitando toda a lógica de negócio sem duplicá-la. Recebe um
// Context montado manualmente (ver src/server/deck/build-diagnostic-deck.ts).
export const createCaller = createCallerFactory(appRouter);

-- Taxa de desenvolvimento passa a ser HORÁRIA (como o custo é negociado na
-- prática) em vez de diária. Os valores já gravados eram diários com jornada
-- de 8h, então dividir por 8 preserva exatamente o custo/dia que a curva de
-- payback já vinha usando — nenhum número existente muda de valor efetivo.
ALTER TABLE "companies" RENAME COLUMN "developerDailyRateBRL" TO "developerHourlyRateBRL";
UPDATE "companies"
  SET "developerHourlyRateBRL" = "developerHourlyRateBRL" / 8
  WHERE "developerHourlyRateBRL" IS NOT NULL;

ALTER TABLE "system_settings" RENAME COLUMN "developerDailyRateBRL" TO "developerHourlyRateBRL";
UPDATE "system_settings"
  SET "developerHourlyRateBRL" = "developerHourlyRateBRL" / 8
  WHERE "developerHourlyRateBRL" IS NOT NULL;

-- Sustentação pós-entrega: taxa horária própria (deliberadamente separada da
-- taxa de desenvolvimento) e horas/semana por robô. NULL nas taxas = herda o
-- global; NULL em maintenanceHoursPerWeek = herda defaultMaintenanceHoursPerWeek.
ALTER TABLE "companies" ADD COLUMN "maintenanceHourlyRateBRL" DOUBLE PRECISION;
ALTER TABLE "system_settings" ADD COLUMN "maintenanceHourlyRateBRL" DOUBLE PRECISION;
ALTER TABLE "system_settings" ADD COLUMN "defaultMaintenanceHoursPerWeek" DOUBLE PRECISION NOT NULL DEFAULT 1;
ALTER TABLE "projects" ADD COLUMN "maintenanceHoursPerWeek" DOUBLE PRECISION;

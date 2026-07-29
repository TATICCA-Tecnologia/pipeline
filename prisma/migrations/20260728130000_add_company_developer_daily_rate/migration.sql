-- Taxa diária do desenvolvedor por empresa, usada no cálculo de payback.
-- NULL = herda system_settings."developerDailyRateBRL". Sem backfill: todas as
-- empresas existentes continuam herdando o valor global, exatamente como antes.
ALTER TABLE "companies" ADD COLUMN "developerDailyRateBRL" DOUBLE PRECISION;

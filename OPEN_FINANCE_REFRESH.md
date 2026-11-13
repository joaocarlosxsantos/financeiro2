# Refresh Open Finance agendado

- Gatilho único: `.github/workflows/open-finance-refresh.yml` (8 horários SP, `workflow_dispatch` manual) chama `GET /api/cron/open-finance-refresh` com `Authorization: Bearer $CRON_SECRET`.
- No GitHub, crie o secret `CRON_SECRET` (mesmo valor do `CRON_SECRET` da Vercel) em Settings > Secrets and variables > Actions > Secrets.
- No GitHub, crie a variable `APP_URL` (ex.: `https://seu-app.vercel.app`, sem barra final) em Settings > Secrets and variables > Actions > Variables.
- Na Vercel, defina `OPEN_FINANCE_REFRESH_ENABLED=true` só depois de aplicar `drizzle/pending/open-finance-refresh-log.sql`; com a flag desligada o endpoint responde `skipped`.
- Orçamento: 8 refreshes/dia por item (06:30 é o matinal), intervalo mínimo 90 min, teto mensal 230, `Retry-After` de 429 respeitado.

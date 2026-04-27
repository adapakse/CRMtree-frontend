-- =============================================================================
-- Weryfikacja danych sprzedażowych DWH — ostatnie 6 miesięcy per partner
-- Okres: 2025-11 do 2026-04 (dostosuj jeśli potrzeba)
-- Tabele: dwh.sales, dwh.partner, crm_partners
-- =============================================================================

-- Zmienna okresu — zmień tu jeśli chcesz inny zakres
-- period_from = '2025-11'
-- period_to   = '2026-04'

-- =============================================================================
-- 1. GŁÓWNA TABELA: agregacja per partner — to co widzi frontend (by_partner)
--    Odpowiada zapytaniu z /report endpoint
-- =============================================================================
SELECT
  COALESCE(p.company, COALESCE(dm.company_name, dm.name))  AS partner_name,
  p.id                                                       AS crm_partner_id,
  s.partner_id                                               AS dwh_partner_id,
  u.display_name                                             AS salesperson_name,

  ROUND(SUM(s.gross_sales_value_pln)::numeric,  2)  AS gross_turnover_pln,
  ROUND(SUM(s.net_sales_value_pln)::numeric,    2)  AS net_turnover_pln,
  ROUND(SUM(s.gross_fee_value_pln)::numeric,    2)  AS fees_pln,
  ROUND(SUM(s.gross_margin_value_pln)::numeric, 2)  AS revenue_pln,
  ROUND(
    100.0 * SUM(s.gross_margin_value_pln) / NULLIF(SUM(s.gross_sales_value_pln), 0),
    2
  )                                                         AS margin_pct,
  SUM(s.number_of_products)::int                            AS transactions_count

FROM dwh.sales s
LEFT JOIN crm_partners p  ON p.dwh_partner_id = s.partner_id
LEFT JOIN dwh.partner dm  ON dm.partner_id    = s.partner_id
LEFT JOIN users u         ON u.id             = p.manager_id

WHERE TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'

GROUP BY
  p.company,
  COALESCE(dm.company_name, dm.name),
  p.id,
  s.partner_id,
  u.display_name,
  u.id

ORDER BY SUM(s.gross_sales_value_pln) DESC;


-- =============================================================================
-- 2. KPI ZBIORCZE — wartości globalnego podsumowania (kpi w /report)
-- =============================================================================
SELECT
  ROUND(SUM(s.gross_sales_value_pln)::numeric,  2)  AS gross_turnover_pln,
  ROUND(SUM(s.net_sales_value_pln)::numeric,    2)  AS net_turnover_pln,
  ROUND(SUM(s.gross_fee_value_pln)::numeric,    2)  AS fees_pln,
  ROUND(SUM(s.gross_margin_value_pln)::numeric, 2)  AS revenue_pln,
  ROUND(
    100.0 * SUM(s.gross_margin_value_pln) / NULLIF(SUM(s.gross_sales_value_pln), 0),
    2
  )                                                  AS margin_pct,
  ROUND(
    100.0 * SUM(s.gross_fee_value_pln) / NULLIF(SUM(s.gross_sales_value_pln), 0),
    2
  )                                                  AS fee_rate_pct,
  SUM(s.number_of_products)::int                     AS transactions_count,
  COUNT(DISTINCT s.partner_id)::int                  AS partners_count

FROM dwh.sales s
LEFT JOIN crm_partners p  ON p.dwh_partner_id = s.partner_id
LEFT JOIN dwh.partner dm  ON dm.partner_id    = s.partner_id
LEFT JOIN users u         ON u.id             = p.manager_id
LEFT JOIN crm_partner_groups g ON g.id        = p.group_id

WHERE TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04';


-- =============================================================================
-- 3. KONKRETNY PARTNER — weryfikacja szczegółów (wstaw dwh_partner_id)
--    Odczytaj dwh_partner_id z kolumny crm_partners.dwh_partner_id
-- =============================================================================
-- Najpierw znajdź ID DWH dla partnera:
SELECT id AS crm_id, company, dwh_partner_id
FROM crm_partners
WHERE company ILIKE '%nazwa_partnera%'   -- zmień na fragment nazwy partnera
ORDER BY company;

-- Potem podaj dwh_partner_id poniżej (zastąp 123):
SELECT
  TO_CHAR(s.sale_date, 'YYYY-MM')                   AS period,
  s.service_category                                 AS product_type,
  ROUND(SUM(s.gross_sales_value_pln)::numeric,  2)  AS gross_turnover_pln,
  ROUND(SUM(s.net_sales_value_pln)::numeric,    2)  AS net_turnover_pln,
  ROUND(SUM(s.gross_fee_value_pln)::numeric,    2)  AS fees_pln,
  ROUND(SUM(s.gross_margin_value_pln)::numeric, 2)  AS revenue_pln,
  SUM(s.number_of_products)::int                     AS transactions_count

FROM dwh.sales s

WHERE s.partner_id = 123                              -- <-- wstaw dwh_partner_id
  AND TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'

GROUP BY TO_CHAR(s.sale_date, 'YYYY-MM'), s.service_category
ORDER BY period DESC, SUM(s.gross_sales_value_pln) DESC;


-- =============================================================================
-- 4. SUMA DLA KONKRETNEGO PARTNERA (to co pokazuje kafelek/szczegóły)
--    Odpowiada by_partner[0] z /report?partner_id=123
-- =============================================================================
SELECT
  COALESCE(p.company, COALESCE(dm.company_name, dm.name))  AS partner_name,
  s.partner_id                                               AS dwh_partner_id,
  ROUND(SUM(s.gross_sales_value_pln)::numeric,  2)          AS gross_turnover_pln,
  ROUND(SUM(s.net_sales_value_pln)::numeric,    2)          AS net_turnover_pln,
  ROUND(SUM(s.gross_fee_value_pln)::numeric,    2)          AS fees_pln,
  ROUND(SUM(s.gross_margin_value_pln)::numeric, 2)          AS revenue_pln,
  ROUND(
    100.0 * SUM(s.gross_margin_value_pln) / NULLIF(SUM(s.gross_sales_value_pln), 0),
    2
  )                                                          AS margin_pct,
  SUM(s.number_of_products)::int                             AS transactions_count

FROM dwh.sales s
LEFT JOIN crm_partners p ON p.dwh_partner_id = s.partner_id
LEFT JOIN dwh.partner dm ON dm.partner_id    = s.partner_id

WHERE s.partner_id = 123                              -- <-- wstaw dwh_partner_id
  AND TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'

GROUP BY p.company, COALESCE(dm.company_name, dm.name), s.partner_id;


-- =============================================================================
-- 5. TREND MIESIĘCZNY (ostatnie 6 mies.) — do weryfikacji ewentualnego wykresu
-- =============================================================================
SELECT
  TO_CHAR(s.sale_date, 'YYYY-MM')                   AS period,
  ROUND(SUM(s.gross_sales_value_pln)::numeric,  2)  AS gross_turnover_pln,
  ROUND(SUM(s.gross_margin_value_pln)::numeric, 2)  AS revenue_pln,
  SUM(s.number_of_products)::int                     AS transactions_count,
  COUNT(DISTINCT s.partner_id)::int                  AS active_partners

FROM dwh.sales s
LEFT JOIN crm_partners p ON p.dwh_partner_id = s.partner_id
LEFT JOIN users u        ON u.id             = p.manager_id

WHERE TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'

GROUP BY TO_CHAR(s.sale_date, 'YYYY-MM')
ORDER BY period ASC;


-- =============================================================================
-- 6. DIAGNOSTYKA: partnerzy CRM bez dopasowania w DWH i odwrotnie
-- =============================================================================

-- Partnerzy CRM z ustawionym dwh_partner_id ale brak danych w sales:
SELECT p.id, p.company, p.dwh_partner_id
FROM crm_partners p
WHERE p.dwh_partner_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM dwh.sales s
    WHERE s.partner_id = p.dwh_partner_id
      AND TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
      AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'
  )
ORDER BY p.company;

-- Partnerzy w DWH bez powiązania z CRM (null crm_partner_id):
SELECT
  s.partner_id AS dwh_partner_id,
  COALESCE(dm.company_name, dm.name) AS dwh_name,
  ROUND(SUM(s.gross_sales_value_pln)::numeric, 2) AS gross_turnover_pln
FROM dwh.sales s
LEFT JOIN crm_partners p ON p.dwh_partner_id = s.partner_id
LEFT JOIN dwh.partner dm ON dm.partner_id    = s.partner_id
WHERE p.id IS NULL
  AND TO_CHAR(s.sale_date, 'YYYY-MM') >= '2025-11'
  AND TO_CHAR(s.sale_date, 'YYYY-MM') <= '2026-04'
GROUP BY s.partner_id, COALESCE(dm.company_name, dm.name)
ORDER BY SUM(s.gross_sales_value_pln) DESC
LIMIT 20;

-- Client Services and Outcomes Tracking Database
-- Portfolio query pack (MySQL 8.x)

USE client_outcomes_db;

-- 1) Join report: services delivered with client and staff context
SELECT
  cs.client_service_id,
  cs.client_id,
  c.housing_status,
  sv.service_type,
  sv.service_date,
  sv.duration_minutes,
  st.role AS staff_role
FROM client_services cs
JOIN clients c ON c.client_id = cs.client_id
JOIN services sv ON sv.service_id = cs.service_id
JOIN staff st ON st.staff_id = cs.staff_id
ORDER BY sv.service_date, cs.client_service_id;

-- 2) Total services per client
SELECT
  c.client_id,
  c.housing_status,
  COUNT(cs.client_service_id) AS total_services
FROM clients c
LEFT JOIN client_services cs ON cs.client_id = c.client_id
GROUP BY c.client_id, c.housing_status
ORDER BY total_services DESC, c.client_id;

-- 3) Services by type
SELECT
  sv.service_type,
  COUNT(*) AS total_services
FROM client_services cs
JOIN services sv ON sv.service_id = cs.service_id
GROUP BY sv.service_type
ORDER BY total_services DESC, sv.service_type;

-- 4) Services delivered by staff role
SELECT
  st.role,
  COUNT(*) AS services_delivered
FROM client_services cs
JOIN staff st ON st.staff_id = cs.staff_id
GROUP BY st.role
ORDER BY services_delivered DESC, st.role;

-- 5) Monthly service utilization trend
SELECT
  DATE_FORMAT(sv.service_date, '%Y-%m') AS year_month,
  COUNT(*) AS total_services
FROM client_services cs
JOIN services sv ON sv.service_id = cs.service_id
GROUP BY DATE_FORMAT(sv.service_date, '%Y-%m')
ORDER BY year_month;

-- 6) Average service duration by service type
SELECT
  sv.service_type,
  ROUND(AVG(sv.duration_minutes), 1) AS avg_minutes,
  MIN(sv.duration_minutes) AS min_minutes,
  MAX(sv.duration_minutes) AS max_minutes
FROM services sv
GROUP BY sv.service_type
ORDER BY avg_minutes DESC, sv.service_type;

-- 7) Average outcome score by housing status
SELECT
  c.housing_status,
  ROUND(AVG(o.outcome_score), 1) AS avg_outcome_score,
  COUNT(*) AS n_assessments
FROM clients c
JOIN outcomes o ON o.client_id = c.client_id
GROUP BY c.housing_status
ORDER BY avg_outcome_score DESC;

-- 8) Latest outcome score per client
WITH ranked_outcomes AS (
  SELECT
    client_id,
    assessment_date,
    outcome_score,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY assessment_date DESC) AS rn
  FROM outcomes
)
SELECT
  c.client_id,
  c.housing_status,
  ro.assessment_date AS latest_assessment_date,
  ro.outcome_score AS latest_outcome_score
FROM clients c
JOIN ranked_outcomes ro ON ro.client_id = c.client_id AND ro.rn = 1
ORDER BY latest_outcome_score DESC, c.client_id;

-- 9) Clients with declining outcomes (latest vs previous)
WITH ranked_outcomes AS (
  SELECT
    client_id,
    assessment_date,
    outcome_score,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY assessment_date DESC) AS rn
  FROM outcomes
),
paired AS (
  SELECT
    l.client_id,
    l.outcome_score AS latest_score,
    p.outcome_score AS previous_score,
    (CAST(l.outcome_score AS SIGNED) - CAST(p.outcome_score AS SIGNED)) AS change_score
  FROM ranked_outcomes l
  JOIN ranked_outcomes p
    ON p.client_id = l.client_id
   AND p.rn = 2
  WHERE l.rn = 1
)
SELECT
  c.client_id,
  c.housing_status,
  paired.previous_score,
  paired.latest_score,
  paired.change_score
FROM paired
JOIN clients c ON c.client_id = paired.client_id
WHERE paired.change_score < 0
ORDER BY paired.change_score ASC, c.client_id;

-- 10) Service count and latest outcome together (one row per client)
WITH service_counts AS (
  SELECT client_id, COUNT(*) AS total_services
  FROM client_services
  GROUP BY client_id
),
ranked_outcomes AS (
  SELECT
    client_id,
    assessment_date,
    outcome_score,
    ROW_NUMBER() OVER (PARTITION BY client_id ORDER BY assessment_date DESC) AS rn
  FROM outcomes
)
SELECT
  c.client_id,
  c.housing_status,
  COALESCE(sc.total_services, 0) AS total_services,
  ro.outcome_score AS latest_outcome_score
FROM clients c
LEFT JOIN service_counts sc ON sc.client_id = c.client_id
LEFT JOIN ranked_outcomes ro ON ro.client_id = c.client_id AND ro.rn = 1
ORDER BY total_services DESC, latest_outcome_score DESC, c.client_id;

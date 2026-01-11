-- Client Services and Outcomes Tracking Database
-- Sample data inserts

USE client_outcomes_db;

-- Clients
INSERT INTO clients (age, gender, housing_status, enrollment_date) VALUES
(29, 'Male', 'Unhoused',      '2025-07-10'),
(41, 'Female', 'Shelter',     '2025-08-03'),
(36, 'Male', 'Transitional',  '2025-09-15'),
(52, 'Female', 'Permanent',   '2025-10-01'),
(24, 'Nonbinary', 'Shelter',  '2025-11-20'),
(60, 'Male', 'Other',         '2025-12-05');

-- Staff
INSERT INTO staff (role, hire_date) VALUES
('Case Manager', '2023-02-01'),
('Peer Specialist', '2024-06-15'),
('Clinician', '2022-09-10'),
('Housing Specialist', '2023-11-05'),
('Supervisor', '2021-05-20');

-- Services
INSERT INTO services (service_type, service_date, duration_minutes) VALUES
('Case Management',     '2025-12-10', 45),
('Housing Navigation',  '2025-12-11', 60),
('Benefits Assistance', '2025-12-12', 30),
('Crisis Intervention', '2025-12-18', 90),
('Medication Support',  '2025-12-19', 20),
('Employment Support',  '2026-01-03', 50),
('Life Skills',         '2026-01-05', 40),
('Referral',            '2026-01-07', 15),
('Case Management',     '2026-01-08', 45),
('Housing Navigation',  '2026-01-09', 60);

-- Client services (bridge table)
INSERT INTO client_services (client_id, service_id, staff_id) VALUES
(1, 1, 1),
(1, 2, 4),
(1, 3, 1),
(2, 1, 2),
(2, 5, 3),
(3, 2, 4),
(3, 7, 2),
(4, 9, 1),
(5, 6, 1),
(6, 4, 3),
(6, 10, 4);

-- Outcomes
INSERT INTO outcomes (client_id, assessment_date, outcome_score, notes) VALUES
(1, '2025-12-01', 35, 'Baseline'),
(1, '2026-01-08', 48, 'Improved engagement'),
(2, '2025-12-03', 55, 'Baseline'),
(2, '2026-01-07', 52, 'Slight decline'),
(3, '2025-12-05', 60, 'Baseline'),
(3, '2026-01-09', 68, 'Improvement'),
(4, '2025-12-06', 72, 'Baseline'),
(4, '2026-01-09', 74, 'Stable'),
(5, '2025-12-08', 40, 'Baseline'),
(5, '2026-01-09', 50, 'Improved'),
(6, '2025-12-10', 30, 'Baseline'),
(6, '2026-01-09', 28, 'Decline');
-- Client Services and Outcomes Tracking Database
-- Schema build script for MySQL 8.x

CREATE DATABASE IF NOT EXISTS client_outcomes_db;
USE client_outcomes_db;

-- Clean rebuild (safe if objects exist)
DROP TABLE IF EXISTS client_services;
DROP TABLE IF EXISTS outcomes;
DROP TABLE IF EXISTS services;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS clients;

-- 1) Clients
CREATE TABLE clients (
  client_id INT AUTO_INCREMENT PRIMARY KEY,
  age TINYINT UNSIGNED NOT NULL,
  gender ENUM('Male','Female','Nonbinary','Other','Prefer not to say') NOT NULL,
  housing_status ENUM('Unhoused','Shelter','Transitional','Permanent','Other') NOT NULL,
  enrollment_date DATE NOT NULL,
  CHECK (age BETWEEN 18 AND 90)
) ENGINE=InnoDB;

CREATE INDEX idx_clients_housing_status ON clients(housing_status);
CREATE INDEX idx_clients_enrollment_date ON clients(enrollment_date);

-- 2) Staff
CREATE TABLE staff (
  staff_id INT AUTO_INCREMENT PRIMARY KEY,
  role ENUM('Case Manager','Peer Specialist','Clinician','Housing Specialist','Supervisor','Admin') NOT NULL,
  hire_date DATE NOT NULL
) ENGINE=InnoDB;

CREATE INDEX idx_staff_role ON staff(role);

-- 3) Services
CREATE TABLE services (
  service_id INT AUTO_INCREMENT PRIMARY KEY,
  service_type ENUM(
    'Case Management',
    'Housing Navigation',
    'Benefits Assistance',
    'Crisis Intervention',
    'Medication Support',
    'Employment Support',
    'Life Skills',
    'Referral'
  ) NOT NULL,
  service_date DATE NOT NULL,
  duration_minutes SMALLINT UNSIGNED NOT NULL,
  CHECK (duration_minutes BETWEEN 5 AND 480)
) ENGINE=InnoDB;

CREATE INDEX idx_services_date ON services(service_date);
CREATE INDEX idx_services_type ON services(service_type);

-- 4) Outcomes (assessments)
CREATE TABLE outcomes (
  outcome_id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  assessment_date DATE NOT NULL,
  outcome_score TINYINT UNSIGNED NOT NULL,
  notes VARCHAR(255) NULL,
  CHECK (outcome_score BETWEEN 0 AND 100),
  CONSTRAINT fk_outcomes_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_outcomes_client_date ON outcomes(client_id, assessment_date);

-- 5) Client Services (bridge table)
CREATE TABLE client_services (
  client_service_id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  service_id INT NOT NULL,
  staff_id INT NOT NULL,
  CONSTRAINT fk_cs_client
    FOREIGN KEY (client_id) REFERENCES clients(client_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT fk_cs_service
    FOREIGN KEY (service_id) REFERENCES services(service_id)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT fk_cs_staff
    FOREIGN KEY (staff_id) REFERENCES staff(staff_id)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  UNIQUE KEY uq_cs_unique_assignment (client_id, service_id, staff_id)
) ENGINE=InnoDB;

CREATE INDEX idx_cs_client ON client_services(client_id);
CREATE INDEX idx_cs_staff ON client_services(staff_id);
CREATE INDEX idx_cs_service ON client_services(service_id);

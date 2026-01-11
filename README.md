# Client Services and Outcomes Tracking Database (MySQL)

This is a portfolio ready SQL database that tracks clients, services, outcomes, and staff assignments. It demonstrates relational database design, data integrity with foreign keys, and reporting queries used in operational analytics work.

## What this project includes
- A normalized schema with 5 tables, including a bridge table that supports many to many relationships
- Sample data that loads without foreign key errors
- Portfolio queries using joins, aggregations, and window functions

## Database tables
- clients: Basic client attributes and enrollment date
- staff: Staff roles and hire dates
- services: Service type, service date, and duration
- outcomes: Periodic outcome assessments per client
- client_services: Bridge table linking clients, services, and staff

## How to run
1. Run schema.sql to create the database and tables
2. Run sample_data.sql to insert sample records
3. Run queries.sql to generate reports and analysis outputs

## Example questions answered
- How many services did each client receive?
- What is the average outcome score by housing status?
- Which staff roles deliver the most services?
- Which clients show declining outcomes between the last two assessments?
- What do monthly service trends look like?

## Note on decline calculations
MySQL treats unsigned subtraction differently, so the decline query casts outcome scores to SIGNED before subtracting.

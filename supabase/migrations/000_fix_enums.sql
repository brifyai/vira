-- Fix for ENUM values
-- Run this script FIRST to update the user_role enum safely.
-- PostgreSQL requires these to be committed before they can be used in other functions/policies.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'user';

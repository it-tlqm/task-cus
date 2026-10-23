-- Rollback YC-11 Phase 3 (additive). Chi drop bang snapshot tuyen.
-- Giu nguyen Task/ParticipantEvent/ApprovalCase/ApprovalDecision; khong xoa dau vet pre-check.
-- Khong chay tren Production.

DROP TABLE IF EXISTS "approval_route_snapshots";

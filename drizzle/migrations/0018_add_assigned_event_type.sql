-- Assignment lever (#3, Phase 4): a distinct event type for "the Active reviewer
-- changed", separate from `reassigned` (now the Change Category lever).
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'assigned';

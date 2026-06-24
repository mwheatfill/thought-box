-- Rename the `watcher_email` setting (the new-submission intake-notification DL)
-- to free the "watcher" name now that per-idea Watchers are a real domain concept
-- (#3, CONTEXT "Flagged ambiguities"). This setting is unrelated to idea_watchers.
UPDATE settings SET key = 'intake_notification_email' WHERE key = 'watcher_email';

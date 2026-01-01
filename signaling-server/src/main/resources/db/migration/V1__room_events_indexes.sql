-- Room events base table (safe for first bootstrap).
CREATE TABLE IF NOT EXISTS room_events (
  id BIGINT NOT NULL AUTO_INCREMENT,
  event_id VARCHAR(100) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  room_id VARCHAR(100) NOT NULL,
  occurred_at DATETIME(6) NOT NULL,
  payload JSON NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_events_event_id (event_id)
);

-- Room events access patterns: by room + time, by event type + time.
SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'room_events'
    AND INDEX_NAME = 'idx_room_events_room_time'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_room_events_room_time ON room_events (room_id, occurred_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'room_events'
    AND INDEX_NAME = 'idx_room_events_type_time'
);
SET @sql = IF(@idx_exists = 0,
  'CREATE INDEX idx_room_events_type_time ON room_events (event_type, occurred_at)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Optional: enable if queries frequently filter by room + type + time.
-- SET @idx_exists = (
--   SELECT COUNT(*)
--   FROM INFORMATION_SCHEMA.STATISTICS
--   WHERE TABLE_SCHEMA = DATABASE()
--     AND TABLE_NAME = 'room_events'
--     AND INDEX_NAME = 'idx_room_events_room_type_time'
-- );
-- SET @sql = IF(@idx_exists = 0,
--   'CREATE INDEX idx_room_events_room_type_time ON room_events (room_id, event_type, occurred_at)',
--   'SELECT 1'
-- );
-- PREPARE stmt FROM @sql;
-- EXECUTE stmt;
-- DEALLOCATE PREPARE stmt;

-- Remove mediasoup router metadata storage (no longer owned by Spring).
DROP TABLE IF EXISTS router_info;

SET @col_exists = (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'rooms'
    AND COLUMN_NAME = 'router_id'
);
SET @sql = IF(@col_exists = 1,
  'ALTER TABLE rooms DROP COLUMN router_id',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Hourly measures of the server for the console's "Data" page: network traffic (the whole
-- machine when it is visible, and Musonic Server's own share), CPU, memory, disk. One row an
-- hour: a few hundred kilobytes a year.
CREATE TABLE metric_hour (
    hour        INTEGER PRIMARY KEY,          -- Unix seconds / 3600
    host_rx     INTEGER NOT NULL DEFAULT 0,   -- bytes received by the machine
    host_tx     INTEGER NOT NULL DEFAULT 0,   -- bytes sent by the machine
    app_rx      INTEGER NOT NULL DEFAULT 0,   -- … by Musonic Server
    app_tx      INTEGER NOT NULL DEFAULT 0,
    cpu_sum     REAL NOT NULL DEFAULT 0,      -- sum of CPU % samples (average = sum / samples)
    samples     INTEGER NOT NULL DEFAULT 0,
    memory_max  INTEGER NOT NULL DEFAULT 0,   -- bytes
    disk_used   INTEGER,                      -- bytes, last seen in the hour
    music_bytes INTEGER
) STRICT;

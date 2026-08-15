# Decision 002: Atomic File Replacement

Status: accepted on 2026-08-03.

The JSON adapter must write a complete temporary file and atomically replace the prior notes file.
It must not update the accepted file in place. This narrows the risk of a process interruption
leaving partially written JSON.

This decision extends the repository adapter boundary; it does not change command parsing or
application-service validation.

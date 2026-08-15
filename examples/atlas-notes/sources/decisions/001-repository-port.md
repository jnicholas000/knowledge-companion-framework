# Decision 001: Repository Port

Status: accepted on 2026-07-01.

Atlas Notes will place persistence behind the `NoteRepository` port. The application service owns
validation and orchestration. The JSON file adapter owns serialization and file I/O. The command
parser must not call the adapter directly.

This choice keeps use-case behavior testable without disk I/O and permits another persistence
technology without changing command parsing or application rules. It adds one interface and explicit
mapping at the storage boundary.

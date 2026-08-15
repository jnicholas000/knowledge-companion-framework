# Atlas Notes System Overview

Atlas Notes is a local command-line application. A command parser converts arguments into a command
object. `NoteApplicationService` validates the command and coordinates a `NoteRepository` port. The
initial `JsonFileNoteRepository` adapter persists the collection to one local JSON file.

The parser does not access storage. The application service depends on the repository interface, not
the JSON adapter. Read and write commands therefore share the same application boundary and a future
storage adapter can replace the local file implementation.

The documented request sequence for `atlas add "Call Sam"` is parser → application service →
repository port → JSON adapter → atomic file replacement → result presenter.

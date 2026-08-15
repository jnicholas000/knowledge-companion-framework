# Lumen Observatory Example Pack

Lumen is a fictitious application that schedules telescope observation requests and coordinates
their safe execution. Its temporal windows, instrument configurations, queue arbitration, weather
interlocks, and operator recovery flow are intentionally unlike Atlas Notes' linear CLI and local
persistence model.

All application facts are original fixture material in `sources/`. They are authoritative only for
this fictional pack. No external observatory, company, repository, or third-party content is
represented. `example.maintainer` owns the fixture and its semantic review. As bundled fictional
example content distributed with KCF, this pack is covered by the repository's Apache License 2.0
unless a file or directory explicitly states otherwise. That repository distribution does not
cause external application packs built with KCF to inherit Apache-2.0.

The pack contains accepted identity, domain, architecture, tour, mission, and operational records,
including an explicit uncertainty, plus two versioned evaluation cases. It contains no production
integration, retrieval provider, reasoning provider, learning automation, or application code.

From the repository root:

```sh
node src/cli.js validate examples/lumen-observatory --strict
```

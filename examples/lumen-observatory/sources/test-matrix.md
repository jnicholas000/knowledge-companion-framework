# Lumen Acceptance Test Matrix

| Case | Given | Expected |
| --- | --- | --- |
| Window boundary | Current time equals window start and full duration fits | Request may become eligible |
| Window end | Current time or required duration reaches beyond the exclusive end | Request remains ineligible |
| Closed wind gate | Wind gate is closed and request priority is highest | Request remains ineligible |
| Missing gate status | No fresh status exists for one required gate | Request remains ineligible |
| Equal priority | Two eligible requests share priority | Earlier window end wins, then stable ID |
| Reservation conflict | Another scheduler reserves the selected request first | Refresh and select again; do not double execute |
| Held execution | All gates reopen, hold is confirmed, and duration still fits | Operator may resume the same reservation |
| Expired hold | A gate reopens after the remaining duration no longer fits | Release or fail; do not resume |

These cases are fictional executable expectations, not records of a running implementation. They
support semantic review of the example knowledge and evaluation fixtures only.

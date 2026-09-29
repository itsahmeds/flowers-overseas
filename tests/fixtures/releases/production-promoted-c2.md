# Release — production — {{c2:7}}

Visit 1 (gates): RELEASE: READY {{c2}} (release at {{c0}})

| Gate            | Result | Evidence                                               |
| --------------- | ------ | ------------------------------------------------------ |
| 1 CI on the SHA | PASS   | every job success, the four preview-chain jobs skipped |

Visit 2 (watch): RELEASE: PROMOTED {{c2}}

## Rollback plan

- Previous release: {{c0}}
- Previous deployment id: dep-c0

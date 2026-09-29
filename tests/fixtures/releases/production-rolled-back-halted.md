# Release — production — {{c4:7}}

The note that promoted the bad commit, where the watch caught it: visit 2 reads ROLLED BACK, and a
HALTED line was added later. A rolled-back commit was promoted first, so route (b) reads this
note's previous release.

Visit 1 (gates): RELEASE: READY {{c4}} (release at {{c2}})

Visit 2 (watch): RELEASE: ROLLED BACK {{c4}}

RELEASE: HALTED {{c4}}: watch (error rate over 1%)

## Rollback plan

- Previous release: {{c2}}
- Previous deployment id: dep-c2

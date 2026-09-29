# Release — production — {{c4:7}}

The note that promoted the bad commit, marked HALTED by the watch after the promotion. It is
still the note that promoted it, so route (b) reads its previous release.

Visit 1 (gates): RELEASE: READY {{c4}} (release at {{c2}})

Visit 2 (watch): RELEASE: PROMOTED {{c4}}

RELEASE: HALTED {{c4}}: watch (error rate over 1%)

## Rollback plan

- Previous release: {{c2}}
- Previous deployment id: dep-c2

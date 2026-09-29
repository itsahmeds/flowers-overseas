# Release — production — {{c4:7}}

A later launch of the same commit that reported READY and then halted before any promotion. It
promoted nothing, so route (b) never reads its previous release.

Visit 1 (gates): RELEASE: READY {{c4}} (release at {{c3}})

Visit 2 (watch): RELEASE: HALTED {{c4}}: gate 9 (staging no longer at the READY commit)

## Rollback plan

- Previous release: {{c3}}
- Previous deployment id: dep-c3

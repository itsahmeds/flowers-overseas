# Invoice PDF fonts

The faces the invoice and credit-note PDF embeds (spec 018 §5.2 `renderPdf`, AC-22; TASK-342).
Read at run time by `../render.ts` from `src/modules/invoices/pdf/fonts`, relative to the working
directory; `next.config.ts` traces this folder into the standalone server
(`outputFileTracingIncludes`, the minute tick's route, where the render job runs).

| File | Source | Kept |
|---|---|---|
| `NotoSans-Regular.ttf`, `NotoSans-Bold.ttf` | `notofonts.github.io`, `fonts/NotoSans/hinted/ttf/` (Noto Sans 2022) | U+0020-007E, U+00A0-024F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2100-214F, U+2212, Greek U+0370-03FF, Cyrillic U+0400-04FF |
| `NotoSansHebrew-Regular.ttf` | `fonts/NotoSansHebrew/hinted/ttf/` | U+0020-002F, U+00A0, U+0591-05F4, U+FB1D-FB4F, U+200C-200F |
| `NotoSansArabic-Regular.ttf` | `fonts/NotoSansArabic/hinted/ttf/` | U+0020-002F, U+00A0, U+0600-06FF, U+0750-077F, U+FB50-FDFF, U+FE70-FEFF, U+200C-200F |

Subset with the `subset-font` devDependency (HarfBuzz), `targetFormat: "truetype"`, keeping the
layout tables, so Arabic still joins. PDFKit subsets again per document, so a PDF carries only the
glyphs it prints. Licence: SIL Open Font License 1.1, `OFL.txt`.

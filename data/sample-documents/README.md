# Sample documents

Fictional documents for **Pinecone Media Works**, the demo merchant, to try **Business economics → Add your own rate card or cost sheet**. The company, its address, email and phone number are invented; each PDF says so in its footer.

| File | Upload as | What it shows |
| --- | --- | --- |
| `pinecone-rate-card-oct-2026.pdf` | Rate card | A designed, text-based PDF: letterhead, a table whose service descriptions wrap over several lines before the price, a discount note and terms. Four prices are read; the prose and terms are correctly ignored. |
| `pinecone-cost-sheet-oct-2026.pdf` | Cost sheet | An internal, single-line-per-row cost table. Four costs are read. |
| `pinecone-rate-card-oct-2026.csv` | Rate card | The same prices as a plain CSV. |

The PDFs are produced by a real browser (`node scripts/sample-documents/build.mjs`, from the HTML beside it), so they carry real fonts and a real text layer, like a document exported from an office tool. They are not scans. Their values differ from the built-in sample sources on purpose, so uploading one shows what changes and lets you replace the sample.

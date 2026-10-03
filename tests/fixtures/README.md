# Test fixtures (local only)

Saved product pages used by the parser tests and the browser tests. They are copies
of Heureka/Zboží content, so they are **not committed** (see `.gitignore`). Tests that
need a missing fixture report "SKIPPED" instead of failing.

| File | What it is | How to capture |
| --- | --- | --- |
| `heureka-cz-product.html` | A heureka.cz product page with many offers (only the first ~10 are in the embedded data) | Open the product, Ctrl+S, "Webpage, HTML only" |
| `zbozi-product-embedded.html` | A zbozi.cz product page as the server sends it (offer rows are skeletons, 5 offers embedded, has variants) | Ctrl+S, "Webpage, HTML only" |
| `zbozi-product-rendered.html` | A zbozi.cz product page after the browser drew the offers ("Další obchody" clicked once) | Ctrl+S, "Webpage, Complete"; keep only the `.html` |

When a site changes its pages, capture a fresh copy under the same name and run
`npm test`; failing assertions show what changed.

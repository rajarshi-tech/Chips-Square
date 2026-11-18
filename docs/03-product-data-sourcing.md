# 03 — Product data: name, image, MRP

**Question:** can we pull product name and image straight from Blinkit, Flipkart Minutes, etc.?
**Answer:** not reliably, not legally, and not cheaply — and you don't need to. Enter it manually
through a form that is fast enough to be painless.

---

## 1. What's actually available

| Source | Name | Image | MRP | India coverage | Cost | Verdict |
|---|---|---|---|---|---|---|
| Blinkit official API | ❌ none | ❌ | ❌ | — | — | does not exist |
| Flipkart Minutes official API | ❌ none | ❌ | ❌ | — | — | does not exist |
| Blinkit/Flipkart scraping | ✅ | ✅ | ✅ | good | ToS breach, breaks monthly, blocks datacenter IPs | no |
| Upscrape / DataBlue / QuickCommerceAPI | ✅ | ✅ | ✅ | good | per-credit (~₹1–2 per call) | only for price research |
| Shelf (dashboard) | ✅ | — | ✅ | good | ~₹29,999/mo + GST | absurd at your size |
| **Open Food Facts** | ✅ | ✅ | ❌ | decent for packaged FMCG | **free, no key** | ✅ use it |
| GS1 / barcodelookup / UPCitemdb | ✅ | sometimes | sometimes | patchy | free tier ~100/day, then paid | optional |
| **You, with a phone** | ✅ | ✅ | ✅ | 100% | 25 s per SKU | ✅ the primary path |

Two facts that decide it:

1. **No public API exists.** Their catalogues are hyperlocal — the same product has a different
   price and MRP per dark store, resolved by pincode/lat-long. There is no "the Blinkit catalogue"
   to import, which is why even the paid vendors require a pincode per request.
2. **You have a limited number of SKUs.** 100–300 products is a one-time typing cost of a couple of
   hours. A ₹30k/month data pipeline to avoid that is not a trade, it's a mistake.

## 2. Recommended admin flow

```
[+] Add product
 ├─ 1. Scan barcode ──► Open Food Facts lookup ──► prefill name, brand, size, image
 ├─ 2. …or type the name (search existing first to avoid duplicates)
 ├─ 3. Take photo / upload (own storage)
 ├─ 4. MRP + discount %  →  live preview of the customer price and savings
 └─ 5. Save
```

Notes per step:

1. **Barcode scan in the browser.** `BarcodeDetector` (Chrome/Android, free, no dependency) with
   `html5-qrcode` as the fallback for iOS Safari. `<input type="file" accept="image/*" capture>`
   as the last resort — photographing the barcode works too.
2. **Open Food Facts**: `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
   → `product.product_name`, `brands`, `quantity`, `image_front_url`, `categories_tags`.
   Free, no API key, generous limits (be polite: one request per scan, cache the result).
   **Licensing:** data is ODbL, images are CC-BY-SA → you must attribute ("Product data from Open
   Food Facts") somewhere on the product page or in an about/credits page. Read it once, comply once.
   Coverage is good for Amul/Britannia/Haldiram's/etc., patchy for local brands and loose goods.
3. **Always upload your own image.** Reasons: store CDNs block hotlinking and rotate URLs; OFF images
   are inconsistent in aspect ratio; and a consistent 1:1 white-background photo makes the catalog
   look like a shop rather than a spreadsheet. Compress to WebP at 600×600 on upload.
4. **MRP is what matters commercially**, not the store's selling price. Capture the printed MRP;
   your discount is off that. The store's discounted price is your *cost*, and it belongs in the
   purchase record, not the product.

**Bulk path for the first load:** a CSV import (`name, brand, size, barcode, mrp, discount_pct,
image_url`) with a preview-and-fix table before commit. Fastest way to onboard 200 SKUs.

## 3. Duplicate prevention

The single most common data problem is the same item entered three times as
"Chips", "Lays Chips", "lays chips 52g". Guard rails:

- Normalised unique key: `lower(brand) + lower(name) + size_label`, and unique `barcode` when present.
- Search-as-you-type against existing products *before* the form allows a new name.
- A "merge products" admin action that re-points stock movements and order items to a survivor.

## 4. If you later want store prices automatically

Worth doing only for **a handful of your best sellers**, to answer "are we still cheaper than
Blinkit?", not to populate the catalogue:

- Keep a `competitor_price` table: `product_id, store, observed_at, price_paise, mrp_paise`.
- Enter it by hand once a week (2 minutes for 10 SKUs), or via a paid API for just those 10.
- Show a small "vs Blinkit ₹X" badge on the product page. This is a genuine trust builder and costs
  almost nothing. **Do not build a scraper for it.**

## 5. Acceptance criteria

- [ ] Adding a product by barcode takes under 30 seconds end to end on a phone.
- [ ] Barcode found in OFF → name/brand/size prefilled, admin must still confirm.
- [ ] Barcode not found → form still works, no dead end.
- [ ] Duplicate name+size (case/space-insensitive) is blocked with a link to the existing product.
- [ ] Image uploaded and served from own storage as WebP, ≤ 100 KB, 1:1.
- [ ] ATTRIBUTION for Open Food Facts present in the UI.
- [ ] CSV import with row-level error report and no partial writes on failure.

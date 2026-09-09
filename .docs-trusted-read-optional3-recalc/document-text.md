# Tastes — Dish Data Proposal

- Document ID: 18rs7sGUT1nSL-j6XBflRVI8f2Wer10P3XIj1gwZZwE8
- Revision ID: ANLCKQlbRmwHFJLgrdjtyh-hNmQvaM5rgaemu3y3G024TPmLsFWdGso_6Bbz7iVzSvbphcmnqqsDR93JJOjK1fysuwqQM6AmS03pTwsrCwM
- Selected tab: all
- Protected controls: 0
- Opaque controls: 0
- Authoritative dropdowns: 0

Protected-control annotations are preservation instructions. Do not insert their displayed placeholder text to recreate a native control.

## Tab 1 (t.0)

[P00001 | 1:29 | TITLE]
Tastes — Dish Data Proposal

[P00002 | 29:116 | SUBTITLE]
Crowd Autocomplete, Menu Import, combined delivery, and optional Global Dish extension

[P00003 | 116:132 | HEADING_1]
Effort overview

[P00004 | 132:264 | NORMAL_TEXT]
All estimates are in engineering hours. Conversion basis: 8 hours per working day. Budget is shown only where it has been provided.

[P00005 | 264:265 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00006 | 265:266 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧

[P00007 | 269:276 | NORMAL_TEXT | TABLE row=0 col=0]
Option

[P00008 | 277:291 | NORMAL_TEXT | TABLE row=0 col=1]
Estimate type

[P00009 | 292:309 | NORMAL_TEXT | TABLE row=0 col=2]
Estimate / notes

[P00010 | 311:334 | NORMAL_TEXT | TABLE row=1 col=0]
1 — Crowd Autocomplete

[P00011 | 335:352 | NORMAL_TEXT | TABLE row=1 col=1]
Backend estimate

[P00012 | 353:362 | NORMAL_TEXT | TABLE row=1 col=2]
8 hours.

[P00013 | 364:387 | NORMAL_TEXT | TABLE row=2 col=0]
1 — Crowd Autocomplete

[P00014 | 388:406 | NORMAL_TEXT | TABLE row=2 col=1]
Frontend estimate

[P00015 | 407:416 | NORMAL_TEXT | TABLE row=2 col=2]
8 hours.

[P00016 | 418:441 | NORMAL_TEXT | TABLE row=3 col=0]
1 — Crowd Autocomplete

[P00017 | 442:448 | NORMAL_TEXT | TABLE row=3 col=1]
Total

[P00018 | 449:473 | NORMAL_TEXT | TABLE row=3 col=2]
16 hours; budget: $300.

[P00019 | 475:491 | NORMAL_TEXT | TABLE row=4 col=0]
2 — Menu Import

[P00020 | 492:509 | NORMAL_TEXT | TABLE row=4 col=1]
Backend estimate

[P00021 | 510:589 | NORMAL_TEXT | TABLE row=4 col=2]
16 hours. Uses existing Tastes venues filtered for Monaco, Madrid, and London.

[P00022 | 591:607 | NORMAL_TEXT | TABLE row=5 col=0]
2 — Menu Import

[P00023 | 608:626 | NORMAL_TEXT | TABLE row=5 col=1]
Frontend estimate

[P00024 | 627:636 | NORMAL_TEXT | TABLE row=5 col=2]
3 hours.

[P00025 | 638:654 | NORMAL_TEXT | TABLE row=6 col=0]
2 — Menu Import

[P00026 | 655:661 | NORMAL_TEXT | TABLE row=6 col=1]
Total

[P00027 | 662:701 | NORMAL_TEXT | TABLE row=6 col=2]
19 hours total. Runtime budget is TBD.

[P00028 | 703:720 | NORMAL_TEXT | TABLE row=7 col=0]
1 + 2 — Combined

[P00029 | 721:738 | NORMAL_TEXT | TABLE row=7 col=1]
Backend estimate

[P00030 | 739:749 | NORMAL_TEXT | TABLE row=7 col=2]
24 hours.

[P00031 | 751:768 | NORMAL_TEXT | TABLE row=8 col=0]
1 + 2 — Combined

[P00032 | 769:787 | NORMAL_TEXT | TABLE row=8 col=1]
Frontend estimate

[P00033 | 788:798 | NORMAL_TEXT | TABLE row=8 col=2]
11 hours.

[P00034 | 800:817 | NORMAL_TEXT | TABLE row=9 col=0]
1 + 2 — Combined

[P00035 | 818:824 | NORMAL_TEXT | TABLE row=9 col=1]
Total

[P00036 | 825:841 | NORMAL_TEXT | TABLE row=9 col=2]
35 hours total.

[P00037 | 843:868 | NORMAL_TEXT | TABLE row=10 col=0]
Optional 3 — Global Dish

[P00038 | 869:886 | NORMAL_TEXT | TABLE row=10 col=1]
Backend estimate

[P00039 | 887:1041 | NORMAL_TEXT | TABLE row=10 col=2]
128–224 additional hours for canonical entities, aliases, translations, matching, confidence thresholds, merge/split support, and cross-venue aggregates.

[P00040 | 1043:1068 | NORMAL_TEXT | TABLE row=11 col=0]
Optional 3 — Global Dish

[P00041 | 1069:1087 | NORMAL_TEXT | TABLE row=11 col=1]
Frontend estimate

[P00042 | 1088:1173 | NORMAL_TEXT | TABLE row=11 col=2]
16–32 additional hours for ambiguous-match confirmation and future global discovery.

[P00043 | 1175:1200 | NORMAL_TEXT | TABLE row=12 col=0]
Optional 3 — Global Dish

[P00044 | 1201:1207 | NORMAL_TEXT | TABLE row=12 col=1]
Total

[P00045 | 1208:1283 | NORMAL_TEXT | TABLE row=12 col=2]
208–368 additional hours beyond Parts 1 and 2, including data work and QA.

[P00046 | 1284:1298 | HEADING_1]
Scope details

[P00047 | 1298:1321 | HEADING_2]
1 — Crowd Autocomplete

[P00048 | 1321:1682 | NORMAL_TEXT]
Venue-specific autocomplete in the review flow. As the user types a dish, Tastes suggests dishes already entered for that venue. The user selects an existing item or adds a new one when no suitable match exists. This reduces spelling variants and duplicate venue dishes, improves dish-level ratings and “top dishes at this venue,” and should be included in v1.

[P00049 | 1682:1698 | HEADING_2]
2 — Menu Import

[P00050 | 1698:2046 | NORMAL_TEXT]
Import public restaurant menus from web pages or PDFs into structured venue menu items using an LLM-assisted extraction pipeline. The initial scope uses the existing venue list from the Tastes project, filtered to Monaco, Madrid, and London, with approximately 50 priority venues. Imported items should be reviewed or validated before publication.

[P00051 | 2046:2071 | HEADING_2]
Optional 3 — Global Dish

[P00052 | 2071:2533 | NORMAL_TEXT]
Add a canonical Global Dish entity above restaurant-specific menu items. It stores a canonical name, aliases, translations, category, and optional common ingredients, then links equivalent items across venues. Matching can use spelling, semantics, ingredients, cuisine, preparation method, and images, with confidence thresholds and user confirmation. This enables cross-restaurant search and recommendations such as “Where can I get the best Pizza Margherita?”

[P00053 | 2533:2555 | HEADING_1]
Notes and assumptions

[P00054 | 2555:2641 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
All estimates are engineering hours; the conversion basis is 8 hours per working day.

[P00055 | 2641:2718 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
Part 1 budget is $300. No budget has been provided for Part 2 or Optional 3.

[P00056 | 2718:2880 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
The restaurant list for Menu Import comes from the existing Tastes project; this estimate does not include building or purchasing a separate restaurant database.

[P00057 | 2880:3018 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
The Menu Import estimate assumes an MVP based on accessible public web pages and PDFs, not a custom scraper for every restaurant website.

[P00058 | 3018:3171 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
LLM, crawling, OCR, storage, proxy, and recurring refresh costs are not included and remain TBD until the number and format of source menus are sampled.

[P00059 | 3171:3275 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
Approximately 50 priority venues is treated as the initial import batch, not a permanent product limit.

[P00060 | 3275:3378 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
Imported menu data may require manual review because websites, PDFs, languages, and menu layouts vary.

[P00061 | 3378:3586 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
Optional 3 is an expansion beyond Parts 1 and 2. It is not required for venue-level autocomplete or menu import, but it is required for reliable cross-restaurant dish search, comparison, and recommendations.

[P00062 | 3586:3714 | NORMAL_TEXT | LIST id=kix.uj8u00pbl6dl level=0]
Ratings and reviews should remain attached to the restaurant-specific menu item; Optional 3 provides the global grouping layer.

[P00063 | 3714:3715 | NORMAL_TEXT]
⟦EMPTY PARAGRAPH⟧


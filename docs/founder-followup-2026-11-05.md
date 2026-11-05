# Founder follow-up — 5 November 2026

## T-005 / T-045: venue photos

- Discover uses `react-native-maps`: Apple MapKit on iOS / Mac and Google Maps on Android. It does not use Mapbox.
- Google Places content shown on a map must use a Google Map. A separate view without a map has attribution requirements; this is not approval to combine Google photos with the current Apple map. Confirm the intended presentation and billing-account terms before connecting the source. A Google Maps switch on iOS may require a native build.
- The current global Places API Place Details Photos price includes 1,000 free requests per month, then $7 per 1,000 in the first paid tier. Illustrative photo-only costs: 10,000 requests = $63/month; 50,000 = $343/month. These are scenarios, not a forecast: actual photo views, retries, other Places calls, account allowances and taxes affect the bill. Three pilot cities or 100 venues alone do not determine request volume.
- OpenStreetMap supplies open map data, not a venue-photo library or a blanket image licence. An OSM feature may link to Wikimedia Commons or another source. Each selected photo needs its own licence and attribution check; owner/user uploads remain a separate source.

Sources: [Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [Places policies](https://developers.google.com/maps/documentation/places/web-service/policies), [OSM licence](https://www.openstreetmap.org/copyright), [Commons reuse rules](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

Client decision still required: photo source, permitted presentation alongside maps, budget and access. We have not purchased a service or changed map providers.

## Shared dish catalogue

The shared catalogue is implemented. Review-local dish/history IDs remain stable; optional approved canonical IDs connect ratings across authors. Exact aliases and explicit user selection are supported, while ambiguous matches remain for staff review. See [data-model.md](data-model.md) and the [reference integration](../services/backend/functions/src/modules/taste-match/REFERENCE.md).

## T-015: basic comment screening

Basic whole-word comment screening is separate from third-party automatic moderation. The baseline English terms can be extended server-side in `configuration/commentScreening.blockedTerms`. Unicode normalization and zero-width removal are supported; this small list does not claim comprehensive hate-speech detection or image screening. Automatic text/photo moderation still requires the client's provider/access decision.

## Indicative remaining implementation effort

Engineering days, excluding client waiting time and testing/validation that Vadim requested to leave open. These are planning ranges, not delivery commitments.

| Item                   | Remaining development                                             | Dependency                                                                                             |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| T-007                  | Not estimated                                                     | The target requirement is not in the supplied Details PDF; obtain the original item before estimating. |
| T-008 HOT / Trending   | 0 days identified                                                 | Calculations exist; real-activity validation/activation remains separate.                              |
| T-009 Tastemakers      | 0 days identified                                                 | Real-event observation/validation remains separate.                                                    |
| T-010 New spots        | 0.5–1 day for date import, if supplied                            | Client-provided verified opening dates and their format.                                               |
| T-011 Hot in your area | 0 days identified                                                 | Area selection exists; automatic HOT activation follows T-008.                                         |
| T-012 Most reviewed    | 0 days identified                                                 | Implemented.                                                                                           |
| T-013 Popular reviews  | 0 days identified                                                 | Real-event observation/validation remains separate.                                                    |
| T-014 Spam protection  | 0 days identified from this review                                | Existing protections still need real-network observation; do not count as launch acceptance.           |
| T-015 Text moderation  | 1–2 days for an external text-service integration                 | Basic list implemented in this follow-up; external scope/provider and access still required.           |
| T-016 Photo moderation | 2–4 days for external screening and upload quarantine integration | Provider/access approval; include a separate test pass after implementation.                           |

## Other QA observations

- Privacy switches previously saved only on the device. They must not imply protection that the server does not enforce. The follow-up replaces them with a read-only description of public profiles, owner-only wishlists and mutual-follow messaging; full private accounts remain pending the client's scope clarification.
- A highlight can legitimately have no value when a review has no applicable cuisine/tag. Its count describes matching reviews, not all reviews. The remote profile-summary function also required deployment of its current implementation.
- Monte Carlo search was not requested in the cited requirement (which names Menton and Roquebrune); it is not treated as an unimplemented agreed item.

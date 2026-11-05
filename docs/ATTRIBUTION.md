# Attribution setup

The dashboard can only connect a lead to an ad if the ad's identity reaches the CRM. Set these up on every account you want reported.

## 1. Landing-page ads: URL parameters

In Meta Ads Manager, open **Ad → Destination → URL parameters** and paste:

```
utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}
```

- IDs are used instead of names because they survive renames. The dashboard looks the names up from Meta.
- The CRM must store these UTMs on the contact. GHL forms and surveys capture them automatically in the contact's attribution. In Zoho, add custom lead fields and map them on the web form.
- `utm_campaign` set to the exact campaign *name* also works as a fallback.

## 2. Lead form (instant form) ads

When Meta lead forms flow into the CRM through a native integration, the lead usually carries the form, ad and campaign IDs. The CRM adapter reads them into `meta_form_id`, `meta_ad_id` and `meta_campaign_id`. Step 2 also pulls lead form leads straight from Meta, so we can cross-check counts.

## 3. Campaign naming → segments

For a shared ad account with one campaign per franchise partner, name campaigns consistently so a rule can sort them:

```
<Brand> | <Partner/Segment> | <Objective> | <Notes>
e.g.  TFO | Leeds | Leads | Lead form
```

Then add a segment rule such as *campaign name contains `| Leeds |`* → **Partner — Leeds**. A campaign that doesn't fit can be assigned by hand with a per-campaign override.

## How a lead is matched (in order)

1. Explicit Meta campaign ID, or one derived from the ad or ad set ID
2. `utm_campaign` equal to a campaign ID or the exact campaign name
3. Otherwise the lead is **not attributed** and falls into the client's default segment

The **Attributed** column shows the share of leads matched. If it's low, the UTMs or the CRM field mapping are missing.

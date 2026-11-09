# Connecting live Meta and GoHighLevel data

About 30–45 minutes the first time, then about 5 minutes per extra client.

**Landing-page leads (no Meta lead forms)?** Make sure every ad has the URL parameters from [ATTRIBUTION.md](ATTRIBUTION.md). That's what links each GHL lead to its campaign and ad.

## 1. Meta: create a System User token (once, covers every client)

You need admin access to IQC's Meta Business Manager.

1. **Create an app.** Go to developers.facebook.com → **My Apps → Create App** → use case **Other** → type **Business** → name it "IQC Reporting" and connect it to IQC's business portfolio.
2. **Add Marketing API.** In the app dashboard, under **Add products**, set up **Marketing API**.
3. **Create the System User.** In business.facebook.com → **Settings → Users → System users → Add**, name it "IQC Reporting" with role **Admin**.
4. **Give it access to client assets.** With the system user selected, click **Assign assets**:
   - **Ad accounts:** tick each client ad account and give it *View performance* (or "Manage" if that's the only option).
   - **Apps:** tick "IQC Reporting".
   - **Pages:** only needed if a client runs Meta **lead form** ads. Skip this for landing-page-only clients.

   Client ad accounts must be shared with IQC's Business Manager (as a partner) before you can assign them: in the client's portfolio, **Ad accounts → Assign partner** → IQC's business portfolio ID.
   Ad accounts owned by a **client's** portfolio also need the app to have **Advanced Access** to `ads_read` (see "If something fails"). Accounts owned by IQC work with Standard Access.
5. **Generate the token.** Click **Generate new token** → choose the app → **Token expiration: Never** → tick `ads_read` and `business_management` → **Generate** → copy it.
   Only if you run lead form ads, also tick `leads_retrieval`, `pages_show_list` and `pages_read_engagement`.

## 2. Vercel: add four settings

**Project → Settings → Environment Variables.** Add each one with type **Secret**:

| Name | Value |
|---|---|
| `META_ACCESS_TOKEN` | The token from step 1 |
| `TOKEN_ENCRYPTION_KEY` | A random string, 32+ characters. Use a password generator and **save a copy** in your password manager. |
| `CRON_SECRET` | Another random string, 16+ characters |
| `SUPABASE_SECRET_KEY` | Supabase → Project Settings → API Keys → **secret** key (skip if already added) |

Then go to **Deployments → ⋯ → Redeploy**.

## 3. Supabase: run the new database update

Supabase → **SQL Editor → New query**. Paste in all of
[`supabase/migrations/20261106000000_crm_connections.sql`](../supabase/migrations/20261106000000_crm_connections.sql),
click **Run**, and choose "Run without RLS" if asked.

## 4. GHL: create a token for each client sub-account

In each client's sub-account:
1. **Settings → Private Integrations → Create new integration**, named "IQC Reporting".
2. Choose the scopes **View Contacts** (`contacts.readonly`), **View Opportunities** (`opportunities.readonly`) and **View Locations** (`locations.readonly`).
3. Copy the token. It's only shown once.
4. Note the **Location ID**: **Settings → Business Profile** (it's also the code in the sub-account's URL after `/location/`).

If you don't see "Private Integrations", ask the agency owner to enable it under **Agency Settings → Private Integrations**.

## 5. Dashboard: connect each client

Go to **Settings → Connect a client** and enter:
- **Client name**
- **Meta ad account ID(s):** from Ads Manager, e.g. `act_123456789`. Separate several with commas.
- **GHL Location ID** and **token**

Click **Add client**. The dashboard checks both with Meta and GHL before saving, so a typo gets a clear error rather than half-saving. Then click **Sync now** to pull the last 90 days. That takes up to a minute.

## 6. Check the setup

- **Stage mapping** (Settings): each GHL pipeline stage gets a best-guess funnel step. Check them, especially which stages count as **booked** and **won**.
- **Segment rules:** to split a client by campaign (e.g. partners, recruitment), add a rule such as *campaign name contains `| Leeds |`*.
- **Attributed %** on the Overview: if it's low, landing-page ads are missing the URL parameters in [ATTRIBUTION.md](ATTRIBUTION.md).
- **Compare numbers:** spend should match Ads Manager for the same dates (Europe/London). Lead counts should match GHL contacts created in the period.

## 7. Optional: instant new leads

The daily sync runs automatically at about 5–6am. For new leads to appear within seconds:
1. In the client's GHL sub-account, go to **Automation → Workflows → Create** and set the trigger to **Contact Created**.
2. Add the action **Webhook**, method **POST**, URL: copy it from Settings → that client's "Instant new leads" box.
3. Publish.

Each client has its own webhook URL. Don't share it.

## 8. Tidy up
- Settings → **Remove demo data**.
- On **Vercel Pro**, you can sync more often: change the schedule in `vercel.json` (e.g. `0 * * * *` for hourly).

## If something fails

Every sync shows under **Settings → Recent syncs** with the reason. Common ones:

| Message | Fix |
|---|---|
| Meta token is invalid or expired | Generate a new System User token (step 1.5) and update it in Vercel |
| Token doesn't have access to this ad account | Assign the ad account to the System User (step 1.4) |
| Meta blocked the app from this ad account (API access blocked) | The ad account is owned by the client's own business portfolio. Share it with IQC as a partner, then give the app **Advanced Access** to `ads_read`: developers.facebook.com → your app → **App Review → Permissions and features** → `ads_read` → **Request advanced access**. This needs IQC's **business verification** (Business Settings → Security Center). |
| GHL rejected the token | Re-create the Private Integration token and re-enter it in Settings |
| GHL token is missing a scope | Edit the Private Integration and add the three scopes |
| Couldn't decrypt the stored CRM token | `TOKEN_ENCRYPTION_KEY` changed. Re-enter each client's GHL token. |

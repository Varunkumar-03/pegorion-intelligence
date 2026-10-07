# Vertical Bridge Intelligence

Working tower and lease intelligence application, powered by Pegorion.

## Run

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Tower Intelligence: http://localhost:3000 · Lease Intelligence: http://localhost:3000/lease

Tower Intelligence automatically loads the public Vertical Bridge location snapshot when no live feed is configured. Lease Intelligence starts empty until you upload a PDF.

## Lease processing

Upload a PDF of up to **4 MB / 150 pages**. The server reads the actual PDF and streams progress. Results include site ID, premises, parties, lease type, commencement/expiration, base monthly rent, payment cadence, deposit, escalation, renewal options, notice requirements, additional clauses, obligations, explicit due dates and calculated renewal notice deadlines. Fields retain original page references, quoted evidence and confidence. Review the original PDF or extracted page text, and export all fields as JSON.

Without an AI key, the parser recognizes explicitly worded text-PDF fields and obligation sentences. Missing/unverified fields are marked **Not found / Needs review**. Sample values and dates are never substituted.

For broader interpretation, scanned PDFs and AI-assisted questions, create `.env.local` using `.env.example` and set:

```dotenv
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
```

Restart after changing environment variables. With AI enabled, the PDF is sent to the OpenAI Responses API for structured analysis. Scanned pages are transcribed for source review. Provider errors are shown to the user.

**Base rent** is distinguished from current escalated rent. CPI/escalation wording is preserved; annual escalation is not assumed. Deadlines are calculated only from identified terms; recurring obligation dates are not invented.

### Saved documents and workflow

Lease records, source PDFs, owner assignments and completion are saved in **IndexedDB in the current browser**, survive reloads and synchronize between tabs. Dates and scores update against the current date. Clearing browser storage removes saved records. Use JSON export to retain extracted data. Storage is browser-local, not a shared multi-user database.

Upload a second lease/amendment to compare its extracted fields against another uploaded document. Comparisons do not automatically consolidate amendments into the original agreement.

Review-priority weights: documentation completeness 50%, deadline urgency 35%, open/unassigned obligations 15%. This is a workflow-priority model, not a legal risk determination.

## Tower data

### Built-in Vertical Bridge locations

The **Vertical Bridge public locations** source loads the entire public [Vertical Bridge ArcGIS layer](https://www.arcgis.com/home/item.html?id=0a23db42950442fcb9eedfd58b90ce9c), published by ArcGIS user `dfiedler`. On October 7, 2026, the connector verified **15,725 records** across 52 state/territory labels. The source's last edit timestamp is **November 21, 2019**. The date, publisher and source link are displayed in the app.

This historical public layer is not an official current inventory. Vertical Bridge's [current website](https://www.verticalbridge.com/network-infrastructure/towers) reports more than 18,000 owned/master-leased towers; its [site locator](https://portal.verticalbridge.com/) requires account access. Upload a current export or connect a current feed to replace or enrich the historical snapshot.

The connector fetches every source object ID in batches, verifies that all records were returned, and rejects incomplete results. The server caches the snapshot for one hour. The browser saves it in IndexedDB separately from your imported portfolio, so switching sources does not replace your imports. Nationwide API responses use gzip compression to fit serverless response limits.

Available information includes site IDs, names, coordinates, cities/states, structure types, addresses and ASR references where supplied. The source's `AGL` value is preserved under **Original source attributes**; its units are not documented, so it is not automatically interpreted as tower height in feet. Occupancy, power, lease finances and telemetry remain unknown until you supply them.

Location-only portfolios show geographic counts and structure-type charts. The map clusters markers for nationwide performance and includes street/satellite layers. Tower 360 links each coordinate to Google Earth and Google Maps. **Export Google Earth KML** exports every loaded site's coordinates.

### Import Google Earth Pro or GIS exports

1. Load the Vertical Bridge tower layer into Google Earth Pro.
2. Right-click the folder containing the actual tower placemarks, then select **Save Place As**.
3. Save as **KML** or **KMZ**.
4. In Tower Intelligence, click **Import tower file** and choose the export.

The importer supports nested KML folders, KMZ-embedded KML, ExtendedData/SchemaData fields, description-table fields, GeoJSON points, CSV and JSON. It reads KML/GeoJSON coordinate order as longitude, latitude. If the original layer is a remote network link, copy its loaded placemarks into a local folder before exporting; remote links are not followed. Non-point/multi-point features are counted and reported as skipped. Point coordinate or duplicate-ID errors reject the import.

Files can be up to **50 MB** with up to **50,000 mapped sites**. Select **Merge with current sites by ID** to enrich existing locations using operational records; known values are preserved when incoming values are missing. The standard CSV template lists operational fields. JSON accepts an array or an object with a `sites` array. Common export names such as `SiteNo`, `SiteCity`, `SiteStateOrProvince` and `SiteType` are mapped automatically.

Tower imports now use IndexedDB, supporting portfolios larger than localStorage's usual limit. Previously saved localStorage tower data is migrated on first use. Existing lease records are retained during the database upgrade.

Required fields for a mapped site: `id`, `latitude`, `longitude`. Omitted metrics display as **Unknown** and assessments requiring them are withheld.

| Inputs | Intelligence enabled |
| --- | --- |
| `structuralUtilization`, `powerUtilization`, `batteryBackupHours`, `openWorkOrders` | Health and maintenance risk |
| `tenants`, `maxTenants`, `structuralUtilization`, `powerUtilization`, `networkDemand` | Expansion |
| Above plus `fiberAvailable`, `backhaulCapacityGbps`, `equipmentSpace` | Future readiness |
| Above plus `leaseYearsRemaining` | Colocation |
| Above plus `potentialRevenue` | Investment |
| `energyConsumption` (monthly kWh), optional `energyEfficiencyScore` (reported 0–100) | Energy |
| `monthlyRevenue` (USD/month) | Revenue |

`networkDemand`: `High`, `Medium`, `Low`. `equipmentSpace`: `Available`, `Moderate`, `Limited`. Utilizations are percentages from 0–100. Boolean fields accept true/false or yes/no. `potentialRevenue` is a supplied annual USD opportunity. Optional `updatedAt` is the source measurement timestamp.

Imports are validated before replacing the portfolio. Duplicate IDs, invalid coordinates, out-of-range metrics and invalid tenant counts are rejected. CSV supports quoted values, commas and multiline cells.

### Live connection

Configure your telemetry/portfolio service on the server:

```dotenv
TOWER_DATA_URL=https://your-service.example.com/towers
TOWER_DATA_TOKEN=optional_bearer_token
```

The endpoint returns JSON/CSV, GeoJSON, KML or KMZ using the same import formats. Use the correct content type or filename extension in the feed URL. Choose **Live data connection** to poll every **15 seconds**. All eight views recalculate, and the app displays the last successful fetch and supplied site timestamps. Fetch failures retain the last successful live snapshot and show an error. Public/imported locations are snapshots. Credentials remain server-side.

Scores in `lib/scoring.ts` are rule-based decision-support calculations. Counts, charts, maps, rankings and answers use supplied data. Historical telemetry, outage predictions, deployment costs and energy savings are not fabricated.

## Questions

The assistant accepts typed and suggested questions. Without AI, answers use field lookups, clause search and portfolio calculations. With AI, the server sends extracted context to the model for broader questions. Answers include source references.

## Verification

```bash
npm run typecheck
npm test
npm run build
```

Browser checks:

```bash
npx playwright install chromium
npm run test:e2e
```

Tests generate PDFs and GIS fixtures in memory and check extracted fields, missing data, deadlines, KML/KMZ imports, complete paged retrieval, dataset-size response handling, merging and persisted nationwide browser portfolios.

The logo and compact brand symbol are the official assets linked by Vertical Bridge's website. They are served from its official website CDN and require network access on first load.

## Deploy

Vercel and Netlify configuration files are included. Set environment variables in the hosting dashboard. The 4 MB PDF limit fits Vercel's request-body limit. The analysis route requests a 180-second function duration, subject to your hosting plan.

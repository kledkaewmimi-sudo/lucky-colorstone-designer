# Lucky Colorstone Designer

`Lucky Colorstone Designer` is a two-part web application for designing custom gemstone bracelets and managing orders from a back-office CRM.

## What it does

- Customer-facing designer for bracelet creation.
- CRM dashboard for catalog, orders, and settings management.
- Shared JSON-backed data source for stones, orders, and configuration.
- LINE LIFF integration for customer login and order submission.

## Core Concepts

- Customers select wrist size, bead size, and stones in a guided step flow.
- The app calculates pricing from bead size and stone catalog prices.
- Orders are written to a shared API and mirrored in the CRM.
- CRM users can edit stones, update order status, and change global discount settings.

## Main Files

- `index.html` and `app.js`: customer application.
- `crm.html` and `crm.js`: CRM application.
- `data.js`: shared browser API wrapper and in-memory cache.
- `server.ps1`: local static server and JSON API backend.
- `data/stones.json`, `data/orders.json`, `data/settings.json`: persisted seed data.

## Runtime Model

- The browser apps run as static pages with ES modules.
- Data is fetched through `/api/*` endpoints when available.
- The local server also serves static assets from the repository root.
- The customer app stores design state in `localStorage` for refresh recovery.

## CRM Image Upload Configuration

CRM image uploads are routed through `POST /api/uploads/image`.

### Environment variables

The server forwards each upload to an external media endpoint configured by environment variables:

- `IMAGE_UPLOAD_ENDPOINT`
- `IMAGE_UPLOAD_METHOD`
- `IMAGE_UPLOAD_FILE_FIELD`
- `IMAGE_UPLOAD_RESPONSE_URL_FIELD`
- `IMAGE_UPLOAD_EXTRA_FIELDS_JSON`
- `IMAGE_UPLOAD_AUTH_HEADER`
- `IMAGE_UPLOAD_AUTH_VALUE`
- `IMAGE_UPLOAD_PROVIDER_NAME`
- `IMAGE_UPLOAD_MAX_BYTES`

### How each variable is used

- `IMAGE_UPLOAD_ENDPOINT`: required. Full external upload URL.
- `IMAGE_UPLOAD_METHOD`: optional. Defaults to `POST`. `PUT` is also accepted by the proxy.
- `IMAGE_UPLOAD_FILE_FIELD`: optional. Multipart field name for the file blob. Defaults to `file`.
- `IMAGE_UPLOAD_RESPONSE_URL_FIELD`: optional. JSON path for the returned hosted URL. Defaults to `secure_url`.
- `IMAGE_UPLOAD_EXTRA_FIELDS_JSON`: optional. JSON object of extra multipart fields for provider-specific metadata.
- `IMAGE_UPLOAD_AUTH_HEADER`: optional. Header name to send when the provider needs auth.
- `IMAGE_UPLOAD_AUTH_VALUE`: optional. Header value for the auth header.
- `IMAGE_UPLOAD_PROVIDER_NAME`: optional. Label returned in the proxy response for diagnostics.
- `IMAGE_UPLOAD_MAX_BYTES`: optional. Default `6291456` bytes, used to reject oversized uploads before forwarding.

### Request shape

CRM sends JSON to the local proxy:

```json
{
  "entityType": "stone",
  "fileName": "example.png",
  "mimeType": "image/png",
  "dataUrl": "data:image/png;base64,..."
}
```

The proxy only accepts `image/*` payloads and converts the data URL into multipart upload content for the configured external endpoint.

### Response shape

On success, the proxy returns:

```json
{
  "configured": true,
  "success": true,
  "provider": "external-storage",
  "url": "https://cdn.example.com/example.png",
  "fileName": "example.png",
  "mimeType": "image/png"
}
```

If upload is not configured, the proxy returns `503` with `configured: false` and a `requiredConfig` list.

### Admin test checklist

- Desktop stone upload: choose a stone image file, upload it, verify the preview updates and the image URL field is populated.
- Desktop charm upload: choose a charm image file, upload it, verify the preview updates and the charm image URL field is populated.
- Mobile stone upload: pick an image from the device picker, upload it, verify the preview updates correctly on a narrow screen.
- Mobile charm upload: pick an image from the device picker, upload it, verify the preview updates correctly on a narrow screen.
- Manual URL fallback: paste a local repo path or hosted URL into the image field, confirm the preview updates without using upload.
- Save after upload: save the stone/charm record and verify the persisted catalog record contains the returned hosted URL.
- Broken URL handling: paste an invalid URL and confirm the preview falls back to the placeholder without crashing CRM.

### Known failure cases

- Missing `IMAGE_UPLOAD_ENDPOINT` returns `503` and leaves the catalog unchanged.
- Provider rejects the multipart field name or extra fields.
- Provider returns a response shape that does not contain the configured URL field.
- Uploaded file exceeds `IMAGE_UPLOAD_MAX_BYTES`.
- Provider requires auth headers but `IMAGE_UPLOAD_AUTH_HEADER` / `IMAGE_UPLOAD_AUTH_VALUE` are not configured.
- The browser blocks local file selection or camera capture on some mobile devices depending on permissions.

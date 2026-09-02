# Tastes mobile deep-link verification files

Upload the included `.well-known` directory to the document root of the existing
`tastesapp.com` website (normally `public_html`). Do not put it inside another
subdirectory and do not replace any existing website files.

After uploading, these exact URLs must return the JSON files with HTTP 200 and
`Content-Type: application/json`, without redirects or an HTML error page:

- `https://tastesapp.com/.well-known/apple-app-site-association`
- `https://tastesapp.com/.well-known/assetlinks.json`

The included `.htaccess` file sets the correct content type for the extensionless
Apple file on Hostinger's Apache-compatible web server. If the website already has
rules for `.well-known`, merge them rather than overwriting those rules.

Once both URLs work, notify the mobile developer so the iOS and Android production
builds can be installed and tested against the live domain.

`assetlinks.json` currently contains the EAS production signing certificate. If
Google Play App Signing is enabled later, add the Play app-signing SHA-256
fingerprint as an additional entry before the Play Store release.

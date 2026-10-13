# Clone and run Farmart

## Checkout
git clone --branch hardening-capacity https://github.com/rajammy1234567-ai/Sfarmart.git
cd Sfarmart

## Install
Run npm ci in the repository root and separately in each app folder:
userApp, partnerApp, deliveryApp.

## Mobile development
Set EXPO_PUBLIC_API_URL to the intended backend /api URL.
Current reviewed User and Partner backend:
https://farmart-backend-staging.onrender.com/api

From the app folder, run:
npx expo start --go --lan

Use ports 8081 for User, 8082 for Partner, 8083 for Delivery.
Keep phone and computer on the same Wi-Fi.

## Credentials
Backend MongoDB/JWT/payment secrets must be configured privately.
Firebase google-services.json is client configuration.
Firebase admin private keys and signing keys must never be committed.
EAS builds require access to the existing Expo projects and credentials.
Do not change Android package IDs or regenerate signing keys for updates.

## Release checks
Run Expo Doctor and Android export before creating a build.
Verify the production backend in the EAS build logs.
Test the installed release for login, orders, checkout, splash and push.
Expo Go cannot fully verify native splash and push notifications.

## Current limitations
The selected backend uses a test database. Production data readiness,
remaining npm audit advisories, Maps billing and installed-device flows
require verification. Successful builds do not guarantee every feature.

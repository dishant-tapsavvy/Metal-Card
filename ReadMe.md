# DynamicQR

DynamicQR lets an administrator create QR codes that can be activated once with a destination URL. Before activation, scanning a code opens a page that asks for its activation code and destination. After activation, every scan redirects to that fixed destination.

## Features

- Admin sign-in and a simple dashboard for creating and managing QR codes.
- Bulk QR generation in numbered batches, with each batch stored in MongoDB.
- Downloadable ZIP archives containing JPEG QR images with their activation codes.
- Activation codes for new QR codes are also shown in the admin QR list.
- A unique, one-time activation code is shown when a QR code is created.
- Activation codes are hashed in MongoDB; batch codes are also encrypted so authorized admins can re-download them. Codes cannot change an activated destination.
- QR codes work across devices when the app is deployed at a public URL.
- Responsive interface for desktop and mobile.

## Requirements

- Node.js 20 or newer
- MongoDB (local or hosted)

## Run locally

1. Install dependencies:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` and set `MONGODB_URI`, `JWT_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`. Use a unique random JWT secret of at least 32 characters and an admin password of at least 12 characters.
3. Start MongoDB, then run:

   ```sh
   npm run dev
   ```

4. Open [http://localhost:5173](http://localhost:5173) for the Fine Touch Metal Cards storefront. Open [http://localhost:5173/admin/login](http://localhost:5173/admin/login) and sign in with the admin credentials from `.env`.

The first server start creates the admin account in MongoDB. Changing the environment password later does not change an existing account.

The QR Admin link is also available in the storefront footer. The admin dashboard manages dynamic QR codes; each code's `/q/:qrId` link can be activated once with its activation code and a destination URL.

## Using QR codes

Create one code or enter a quantity in the dashboard to create a numbered batch (up to 250 codes). Download a batch ZIP to get a JPEG for each QR code; each image includes its activation code. Deleting a batch permanently removes its QR codes and disables their links. Share the image with the person who will activate it. Scanning the QR opens the activation page. The person enters the code and the destination URL; after successful activation, the browser redirects to that URL. Later scans redirect directly to the same destination.

Batch activation codes are encrypted at rest using a key derived from `JWT_SECRET` so an admin can download the batch again. Keep `JWT_SECRET` stable while batch codes need to remain downloadable.

Activation codes created before encrypted storage was added cannot be recovered from their hashes and are marked unavailable in the admin list.

Set `PUBLIC_APP_URL` to the public base URL of the deployed app before creating QR codes. QR URLs are generated at creation time, so changing this value does not update existing codes. In production, build the frontend with `npm run build` and run the server with `npm start`; the server serves the built app and API from the same origin.

## Environment variables

| Variable | Description |
| --- | --- |
| `PORT` | Server port (default `3001`) |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign admin sessions (minimum 32 characters) |
| `ADMIN_USERNAME` | Username for the first admin account |
| `ADMIN_PASSWORD` | Password for the first admin account (minimum 12 characters) |
| `PUBLIC_APP_URL` | Public app URL embedded in new QR codes (default `http://localhost:5173`) |

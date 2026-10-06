# Frontend

Live dashboard for the PMS5003 sensor: five three.js views of the readings, with the numbers alongside.

```
npm install
npm run dev      # reads the production API by default
```

Set `VITE_API_URL` (see `.env.example`) to point at another API, such as a local backend.

## Deploying (Cloudflare Pages)

Pages builds this folder on every push to `main`, with these settings in its dashboard:

- Root directory: `frontend`
- Build command: `npm run build`
- Build output: `dist`

The `rename-worker` serves the site under `jonathan-orlowski.dev/pollution/`, which is why Vite's `base` is `./`.

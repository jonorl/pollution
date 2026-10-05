# Frontend

Live dashboard for the PMS5003 sensor: a three.js particle chamber and a 24-hour clock ring of minute readings, with the numbers alongside.

```
npm install
npm run dev      # reads the production API by default
```

Set `VITE_API_URL` (see `.env.example`) to point at another API, such as a local backend.

## Deploying (Netlify)

- Base directory: `frontend`
- Build command and publish directory come from `netlify.toml`
- The API must be on a version with the `since` filter on `/readings`

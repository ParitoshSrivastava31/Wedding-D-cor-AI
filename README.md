# Wedding Decor AI — Wedding Studio

A one-page wedding venue design demo. Upload a venue photo, choose a look, and Gemini edits the photo into a wedding décor concept while keeping the original space recognizable.

## What it does

- Accepts JPG, PNG and WebP venue photos, with drag and drop or file selection.
- Includes three sample venues for a quick demo. They load from Unsplash, so the samples need an internet connection.
- Offers Royal Indian, Modern Luxury, Floral Garden and Minimal Elegant styles, plus optional notes.
- Sends the selected photo and prompt to Gemini Nano Banana 2.1 and displays the original beside the generated concept.
- Lets you download the result. Photos are resized in the browser and are not stored by this app.
- Keeps the Gemini API key on the server. It is never sent to the browser.

## Requirements

- Node.js 20.6 or later
- A Gemini API key with access to image generation. Create one in [Google AI Studio](https://aistudio.google.com/apikey).

## Run locally

```bash
cp .env.example .env
```

Add your key to `.env`:

```dotenv
GEMINI_API_KEY=your_real_key_here
```

Then start the app:

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). The project uses Node's built-in server and `fetch`; there are no npm packages to install.

Optional environment values:

| Variable | Default | Purpose |
| --- | --- | --- |
| `GEMINI_API_KEY` | — | Required. Authenticates requests to Gemini. |
| `GEMINI_MODEL` | `gemini-nano-banana-2.1` | Gemini image model identifier. |
| `PORT` | `3000` | Local server port. |

See [`.env.example`](.env.example) for the template. `.env` is ignored by Git; do not commit a real key.

## Deploy to Vercel

1. Push this project to GitHub and import the repository in Vercel.
2. Use the **Other** framework preset. No build command or output directory is needed.
3. Add `GEMINI_API_KEY` in the Vercel project’s Environment Variables. You can also set `GEMINI_MODEL`.
4. Deploy. The static page is served from the project root and `/api/generate` runs as a Node.js Function.

The function has a 60-second limit in [`vercel.json`](vercel.json). If a generation takes longer, the function will time out; local Node hosting can wait up to three minutes. A public deployment also lets visitors use your Gemini quota through its generate endpoint, so keep the demo private or add access protection before sharing it broadly.

The same project can run on any Node.js host with persistent HTTP servers: set the environment variables and run `npm start`.

## Project layout

```text
index.html       Single-page studio UI
styles.css       Responsive visual design
app.js           Upload, style selection, image preparation and result UI
api/generate.js  Gemini image-edit API handler (also used by Vercel)
server.mjs       Dependency-free local Node server
vercel.json      Function duration configuration
.env.example     Environment variable template
```

## Notes

- The browser scales photos to at most 1536 pixels on the longest side and 3.2 MB before sending them, keeping the request within serverless limits.
- Generated images include Gemini’s SynthID watermark. Results are visual concepts, not exact production plans.
- The sample photos are served from Unsplash; upload your own image if a sample is unavailable.


# Aarav Soccer

Kid-friendly 3v3 swipe soccer. Flick to pass or shoot.

Repo: https://github.com/RishabhTayal/aarav-soccer

## Play locally

Open `index.html` in Chrome or Safari, or:

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080

Tap **Play**. First to 5 wins. **Play again** for a rematch. Speaker button mutes sound.

## Deploy on Vercel

This is a static site (`index.html` at the repo root). No build step.

1. Import https://github.com/RishabhTayal/aarav-soccer in Vercel
2. Framework Preset: **Other**
3. Build Command: leave empty
4. Output Directory: `.` or leave default
5. Deploy from `main`

Or from a machine with the Vercel CLI:

```bash
npx vercel --prod --yes
```

`vercel.json` pins it as a static project with clean URLs.

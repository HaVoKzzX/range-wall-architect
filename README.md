# Range Wall Architect

**Centurion Invictus** planner for [American Range Walls](https://americanrangewalls.com/product/american-range-wall/).

[www.centurioninvictus.com](https://www.centurioninvictus.com)

Each wall is **78″ tall × 54¼″ wide**, about **8″ thick**, **20 lb**, **$99**. The floor snaps to a grid the same size as one panel so layouts match what you can actually build.

© 2026 Centurion Invictus LLC. All rights reserved.

## Run it locally

Double-click `launch.bat`, or open `index.html` in a browser.

To preview the Streamlit wrapper:

```bash
pip install -r requirements.txt
streamlit run streamlit_app.py
```

## Put it online (Streamlit Community Cloud)

This repo is set up for [share.streamlit.io](https://share.streamlit.io):

1. Open [share.streamlit.io](https://share.streamlit.io) and sign in with GitHub.
2. **Create app** → **Yup, I have an app**.
3. Repository: `HaVoKzzX/range-wall-architect` · Branch: `main` · Main file: `streamlit_app.py`.
4. Optional: set the app URL to `range-wall-architect`.
5. Deploy.

The live app is a full-screen copy of the planner (walls, generate, save/load, PNG, print/PDF).

## What you can do

- Enter your space in feet and how many walls you have
- Lock walls to the 54¼″ panel grid
- Drag, paint, rotate, and erase walls like a board game
- Place wall-hanging targets, target stands, 55-gal plastic drums, hostages, hostage takers, and instructors
- Generate a random shoot house from your inventory (rooms, opening style, entry side, door width, target mix)
- Use **optimal target** and **optimal instructor** placement
- Shuffle props without moving walls
- Save / load JSON, export PNG
- **Print / PDF** — one-page professional field sheet with the plan, walls required, target list, cover, personnel, and room schedule (`P`)

Keyboard: `1–9` tools, `G` generate, `R` rotate, `Del` remove, scroll zoom, middle-drag or Space-drag pan, `Ctrl+Z` / `Ctrl+Y` undo/redo.

On phones and tablets: **Setup** and **Sheet** open the side panels, the floor fills the screen, pinch to zoom, drag empty floor to pan, long-press to remove.

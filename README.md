# Trip Planner

A small, self-contained web app for planning trips: log flights, car rentals,
and stays, add activities, drag everything onto the right day, and export a
clean PDF itinerary. No backend, no account — it's a handful of static files.

## What's in here

```
index.html      the app shell (3 tabs: Trip, Add, Plan)
style.css       all styling
app.js          all app logic (storage, forms, drag-and-drop, PDF export)
manifest.json   makes it installable as a home-screen app
sw.js           lets it work offline once installed
icons/          app icons
```

## Updating your already-live app

Already deployed this once? Just replace the files in your repo with the
ones in this folder (same filenames) and push/upload again — no new repo or
Pages setup needed. Give it a minute, then reload the app on your phone. If
it looks unchanged, force-quit it from the home screen and reopen.

## Deploy it (pick one — both are free)

### Option A: GitHub Pages
1. Create a new **public** GitHub repo (e.g. `trip-planner`).
2. Upload all the files in this folder to the repo (keep the `icons/`
   folder structure as-is).
3. In the repo, go to **Settings → Pages**. Under "Build and deployment,"
   set Source to **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. Save. GitHub gives you a URL like
   `https://yourusername.github.io/trip-planner/` — that's your app.
   It can take a minute or two to go live the first time.

### Option B: Vercel
1. Go to vercel.com, sign in (GitHub login is easiest), and click
   **Add New → Project**.
2. Either import the GitHub repo from Option A, or drag this whole folder
   into Vercel's "deploy" upload area.
3. Leave the build settings blank/default (it's static files, no build step
   needed) and deploy. You'll get a URL like `trip-planner.vercel.app`.

Either way you end up with a plain URL — that's what you'll open on your
iPhone/iPad in the next step.

## Add it to your iPhone / iPad home screen

1. Open your deployed URL in **Safari** (this only works in Safari, not
   Chrome, on iOS).
2. Tap the **Share** icon (square with an arrow) in the toolbar.
3. Tap **Add to Home Screen**, confirm the name, and tap **Add**.

It now opens full-screen with its own icon, no Safari address bar — it
behaves like a real app. This uses a technology called a PWA (progressive
web app); no App Store involved.

## One important thing about your data

Everything you enter is stored **only in that browser, on that one device**
(in `localStorage`) — that was the setup you asked for, so nothing needs an
account or internet connection to save. The trade-off: your iPhone and iPad
will have **separate, independent copies**. If you plan a trip on your
iPhone, it won't show up on your iPad unless you also enter it there.

If you ever want it to sync across devices, that's a bigger change (it needs
a small free backend like Firebase or Supabase) — just let me know and I can
build that version.

Also worth knowing: clearing Safari's site data/history for this app, or a
fresh browser install, will wipe what's stored. Exporting a trip to PDF
regularly is a good way to keep a durable copy.

## Using it

- **Trip tab** — name your trip and set start/end dates using the calendar.
  This is what generates the day-by-day structure on the Plan tab.
- **Add tab** — switch between Flight / Car / Stay / Activity and fill in
  details. Any location field (flight from/to, car pick-up/drop-off, stay
  address, activity location) has a **Find** button — type a real address
  or place name and tap it to look it up; if there's more than one match
  you'll get a short list to pick the right one from. That's what puts the
  pin on the Map tab. Everything you add lands in "Not yet scheduled" until
  you place it on a day. (Flights, cars, and stays with a date/time will
  actually auto-place themselves on the matching day — you can still drag
  them elsewhere.)
- **Plan tab** — drag cards between the tray and any day, and reorder within
  a day, to build the itinerary. Tap a card to edit its title, notes, and
  time right there. Tap **Export PDF** in the top bar any time to download a
  formatted itinerary.
- **Map tab** — every flight, car, stay, and activity you've looked up an
  address for shows up as a pin here, color-coded by type. Use the dropdown
  to filter to a single day. Tap a pin for details.

### About the address lookup and map

Both run on free, no-account services — [OpenStreetMap Nominatim](https://nominatim.org/)
for turning an address into map coordinates, and OpenStreetMap tiles for the
map itself. No API key, nothing to configure. Two things worth knowing:

- It works best with fairly complete addresses or well-known place names
  ("Belém Tower, Lisbon" beats just "tower"). Airport codes alone (like
  "DFW") sometimes miss — the airport's full name usually works better.
- It's a shared public service with light rate limits, which is why lookups
  require tapping **Find** rather than happening as you type. That's plenty
  for planning a trip; it's not built for bulk/automated lookups.

## Customizing

It's plain HTML/CSS/JS, so it's easy to tweak by hand or ask Claude to edit:
- Colors and fonts are CSS variables at the top of `style.css`.
- Item types/fields live in `app.js` (`collectFieldsForType`,
  `fieldsToFormType`, `deriveTitle`, `deriveMeta`) and the matching form
  markup in `index.html` — add a field in both places to extend a type, or
  copy the pattern to add a whole new type.
- The map and address lookup logic is in the "Geocoding" and "Map tab"
  sections of `app.js`.

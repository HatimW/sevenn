# Sevenn

Sevenn is an offline-first study app for organizing diseases, drugs, and concepts.
This repository hosts the SPA implementation using vanilla JavaScript modules.

## Development

Install dependencies (for the optional local server and future tooling):

```bash
npm install
```

Start a dev server:

```bash
npm start
```

Run the placeholder test suite:

```bash
npm test
```

The site will be available at the URL shown in the terminal. You can also simply open
`index.html` directly in a modern browser.

The **Settings** tab lets you adjust the daily review target and manage curriculum
blocks with their lectures. It also offers buttons to export or import the
database as JSON and to export an Anki-compatible CSV. Data is stored locally
using IndexedDB.

## Roadmap

See the implementation blueprint in the repository for planned modules and features.

## Python prototype

An optional Python entry point is included for future backend experiments. It
spins up a very small Flask application that returns a greeting.

Install dependencies:

```bash
pip install -r requirements.txt
```

Start the development server:

```bash
python -m app.main
```

Then visit [http://localhost:5000/hello/world](http://localhost:5000/hello/world)
in your browser to verify the server responds with a JSON greeting.

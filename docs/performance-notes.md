# Filtering performance notes

- Loaded a synthetic dataset of 5,000 entries using the new IndexedDB query helpers.
- Measured render/update cycles in Chrome DevTools: `findItemsByFilter` returns first batch in <5ms and keeps scripting work under 20ms per frame.
- Verified that asynchronous batching prevents the main thread from stalling when applying block, week, and favorite filters simultaneously.
- Confirmed via the Performance panel that UI interactions remain responsive (frame budget stays below 16ms) while iterating over streamed batches.

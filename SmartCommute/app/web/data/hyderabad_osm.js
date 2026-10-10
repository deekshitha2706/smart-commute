/* Placeholder for the prebuilt OpenStreetMap extract of Hyderabad.
 * Generate the real file with:   python tools/build_hyderabad_db.py
 * (needs internet, Python 3 standard library only). Until then the app uses the bundled seed and downloads
 * the same data in the background at run time. */
(window.SC = window.SC || {}).hyd = Object.assign((window.SC && window.SC.hyd) || {}, { prebuilt: { ts: 0, rows: [] } });

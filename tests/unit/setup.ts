import 'fake-indexeddb/auto';

// The Retraction Watch index ships with the site as static files. Offline tests read the same files from disk.
import { readFileSync } from 'node:fs';
import { readRetractionWatchFrom } from '@/core/registries/retractionWatch';
readRetractionWatchFrom(async (path) => JSON.parse(readFileSync(`public/data/retraction-watch/${path}`, 'utf8')));

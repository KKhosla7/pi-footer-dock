import { readAhead } from '../../src/adapters/git-ahead.js';

/** The ahead reader, so a test can prove it goes through the guarded entry point too. */
export const readAheadReport = readAhead;

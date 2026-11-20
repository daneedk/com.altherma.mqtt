'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const startCsvDownloadServer = require('./lib/csv-download-server');

const LOG_DIR = '/userdata/heatpump-logs';

module.exports = {
  async getLogs({ homey }) {
    const entries = await fs.readdir(LOG_DIR).catch(() => []);
    return entries
      .filter((name) => name.endsWith('.csv'))
      .map((name) => name.slice(0, -4))
      .sort()
      .reverse();
  },

  async getLogDownloadUrl({ homey, params }) {
    const date = params.date;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error('Invalid date');
    }
    const today = new Date().toISOString().slice(0, 10);
    const suffix = date === today ? `(partial) ${date}` : date;
    const filename = `Daikin Altherma log ${suffix}.csv`;

    const closeTabMessage = homey.__('settings.csvdownload.closetab');
    const port = await startCsvDownloadServer(path.join(LOG_DIR, `${date}.csv`), filename, closeTabMessage);
    const address = await homey.cloud.getLocalAddress();
    const host = address.split(':')[0];
    return `http://${host}:${port}/`;
  },
};
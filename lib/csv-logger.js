// lib/csv-logger.js
const fs = require('node:fs/promises');
const path = require('node:path');

function dateStamp(d = new Date()) {
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

module.exports = async (header, { dir = '/userdata/heatpump-logs', retentionDays = 30 } = {}) => {
  let currentDate = null;
  let fh = null;

  const filePath = (date) => path.join(dir, `${date}.csv`);

  const purgeOldFiles = async () => {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    const entries = await fs.readdir(dir).catch(() => []);
    for (const name of entries) {
      if (!name.endsWith('.csv')) continue;
      const date = name.slice(0, -4);
      const parsed = Date.parse(date);
      if (!Number.isNaN(parsed) && parsed < cutoff) {
        await fs.unlink(path.join(dir, name)).catch(() => {});
      }
    }
  };

  const rotateIfNeeded = async () => {
    const today = dateStamp();
    if (today === currentDate) return;

    if (fh) await fh.close();

    currentDate = today;
    const isNewFile = await fs.access(filePath(today)).then(() => false, () => true);
    fh = await fs.open(filePath(today), 'a');
    if (isNewFile) await fh.write(header + '\n');

    await purgeOldFiles();
  };

  await fs.mkdir(dir, { recursive: true });
  await rotateIfNeeded();

  return {
    writeRow: async (line) => {
      await rotateIfNeeded();
      await fh.write(line + '\n');
    },

    stop: async () => {
      if (fh) await fh.close();
      fh = null;
      currentDate = null;
    },
  };
};
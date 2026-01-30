// "homey-log-to-file": "github:robertklep/homey-log-to-file"

const fs                   = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const http                 = require('http');

async function keepLastNLines(filePath, maxLines, chunkSize = 64 * 1024) {
  const fh = await fs.open(filePath, 'r');
  try {
    const st = await fh.stat();
    let pos = st.size;
    let buf = '';
    let nlCount = 0;

    while (pos > 0 && nlCount <= maxLines) {
      const toRead = Math.min(chunkSize, pos);
      pos -= toRead;

      const b = Buffer.allocUnsafe(toRead);
      await fh.read(b, 0, toRead, pos);

      buf = b.toString('utf8') + buf;
      nlCount = (buf.match(/\n/g) || []).length;
    }

    if (nlCount > maxLines) {
      let cut = buf.length;
      let seen = 0;
      for (let i = buf.length - 1; i >= 0; i--) {
        if (buf[i] === '\n') {
          seen++;
          if (seen === maxLines + 1) { cut = i + 1; break; }
        }
      }
      buf = buf.slice(cut);
    }

    await fs.writeFile(filePath, buf, 'utf8');
  } finally {
    await fh.close();
  }
}

module.exports = async (logfile = '/userdata/std.log', port = 8008, flags = 'a') => {
  const { hookStd } = await import('hook-std');
  const fh          = await fs.open(logfile, flags);

  // Create HTTP server that will serve the file
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    createReadStream(logfile).pipe(res);
  }).listen(port);

  let stopping = false;
  let lastOp = Promise.resolve();
  let trimTimer = null;

  // Capture stdout/stderr and write to file
  const unhook = hookStd({ silent: false }, output => {
    if (stopping) return;

    lastOp = lastOp
      .then(() => fh.write(output))
      .catch(() => {});
  });

  const trim = async (lines = 5760) => {
    // serialize with writes to avoid races
    lastOp = lastOp
      .then(() => keepLastNLines(logfile, lines))
      .catch(() => {});
    return lastOp;
  };

  const startAutoTrim = (lines = 10240) => {
    if (trimTimer) return;
    trimTimer = setInterval(() => { trim(lines); }, 2 * 24 * 60 * 60 * 1000); // every 2 days
  };

  const stopAutoTrim = () => {
    if (!trimTimer) return;
    clearInterval(trimTimer);
    trimTimer = null;
  };

  return {
    trim,              // manual call if you want
    startAutoTrim,     // start the every-other-day trimming
    stopAutoTrim,

    stop: async ({ removeFile = true } = {}) => {
      stopping = true;
      stopAutoTrim();

      unhook.unhook();                 // <-- stop hook first

      await lastOp.catch(() => {});
      await new Promise(r => server.close(r));
      await fh.close();

      if (removeFile) {
        await fs.unlink(logfile).catch(err => {
          if (err.code !== 'ENOENT') throw err; // ignore "already gone"
        });
      }
    },
  };
};

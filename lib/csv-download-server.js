'use strict';

const http = require('http');
const fs = require('node:fs/promises');

module.exports = async (filePath, downloadFilename, closeTabMessage) => {
  const csvBase64 = await fs.readFile(filePath, 'base64');

  const escapedMessage = closeTabMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = '<!doctype html><html><body style="font-family: sans-serif; text-align: center; padding-top: 40px;">'
    + '<p>' + escapedMessage + '</p>'
    + '<script>'
    + 'var csvText = atob("' + csvBase64 + '");'
    + 'var blob = new Blob([csvText], { type: "text/csv" });'
    + 'var url = URL.createObjectURL(blob);'
    + 'var a = document.createElement("a");'
    + 'a.href = url;'
    + 'a.download = ' + JSON.stringify(downloadFilename) + ';'
    + 'document.body.appendChild(a);'
    + 'a.click();'
    + '</script></body></html>';

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
      res.on('finish', () => {
        server.close();
      });
    });

    server.on('error', reject);

    server.listen(0, () => {
      resolve(server.address().port);
      setTimeout(() => server.close(), 30000);
    });
  });
};
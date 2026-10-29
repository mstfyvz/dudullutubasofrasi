const test = require('node:test');
const assert = require('node:assert/strict');
const { createRawPrintScript } = require('./windowsPrinter');

test('builds a RAW Windows spooler script with lossless receipt bytes', () => {
  const printerName = 'Mutfak Yazıcısı';
  const receipt = Buffer.from([0x1b, 0x40, 0x00, 0x1d, 0x56, 0x42]);
  const script = createRawPrintScript(printerName, receipt);
  const encodedPrinterName = Buffer.from(printerName, 'utf8').toString('base64');
  const encodedReceipt = Buffer.from(receipt).toString('base64');

  assert.match(script, new RegExp(`FromBase64String\\('${encodedPrinterName}'\\)`));
  assert.match(script, new RegExp(`FromBase64String\\('${encodedReceipt}'\\)`));
  assert.match(script, /pDataType = "RAW"/);
  assert.match(script, /WritePrinter\(printer, unmanagedBytes, bytes\.Length, out written\)/);
});
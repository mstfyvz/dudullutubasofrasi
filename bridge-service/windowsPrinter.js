const { spawn } = require('node:child_process');

const POWERSHELL = 'powershell.exe';

function listPrinters() {
  const script = [
    "$ErrorActionPreference = 'Stop'",
    '$OutputEncoding = [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    'Get-Printer -ErrorAction Stop | ForEach-Object { $_.Name }',
  ].join('\n');

  return runPowerShell(script).then((output) =>
    output.split(/\r?\n/).map((name) => name.trim()).filter(Boolean)
  );
}

function printReceipt(printerName, receipt) {
  const script = createRawPrintScript(printerName, receipt);
  return runPowerShell(script).then((output) => {
    const result = output.match(/(?:^|\r?\n)(\d+)\r?\nRAW_PRINT_SUBMITTED\s*$/);
    if (!result) {
      throw new Error('Windows yazdırma işlemi iş numarası döndürmedi.');
    }
    return result[1];
  });
}

function createRawPrintScript(printerName, receipt) {
  const encodedPrinterName = Buffer.from(printerName, 'utf8').toString('base64');
  const encodedReceipt = Buffer.from(receipt).toString('base64');

  return [
    "$ErrorActionPreference = 'Stop'",
    `Add-Type -TypeDefinition @'\n${RAW_PRINTER_SOURCE}\n'@`,
    `$printerName = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedPrinterName}'))`,
    `$receipt = [Convert]::FromBase64String('${encodedReceipt}')`,
    '[RawPrinter]::SendBytes($printerName, $receipt)',
    "Write-Output 'RAW_PRINT_SUBMITTED'",
  ].join('\n');
}

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const guardedScript = [
      'try {',
      script,
      '} catch {',
      '  [Console]::Error.WriteLine($_.Exception.ToString())',
      '  exit 1',
      '}',
    ].join('\n');
    const encodedScript = Buffer.from(guardedScript, 'utf8').toString('base64');
    const command = `$script = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedScript}')); Invoke-Expression $script`;
    const child = spawn(POWERSHELL, [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      '-',
    ], { windowsHide: true });
    let output = '';
    let errorOutput = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { errorOutput += chunk; });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(errorOutput.trim() || `PowerShell yazdırma komutu başarısız oldu (kod: ${code})`));
      }
    });
    child.stdin.once('error', reject);
    child.stdin.end(command, 'utf8');
  });
}

const RAW_PRINTER_SOURCE = String.raw`
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;

public static class RawPrinter
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private struct DOC_INFO_1
    {
        public string pDocName;
        public string pOutputFile;
        public string pDataType;
    }

    [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string printerName, out IntPtr printer, IntPtr defaults);
    [DllImport("winspool.drv", EntryPoint = "ClosePrinter", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern int StartDocPrinter(IntPtr printer, int level, ref DOC_INFO_1 documentInfo);
    [DllImport("winspool.drv", EntryPoint = "EndDocPrinter", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "StartPagePrinter", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "EndPagePrinter", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr printer);
    [DllImport("winspool.drv", EntryPoint = "WritePrinter", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr printer, IntPtr bytes, int count, out int written);

    public static int SendBytes(string printerName, byte[] bytes)
    {
        IntPtr printer;
        if (!OpenPrinter(printerName, out printer, IntPtr.Zero))
            throw new Win32Exception(Marshal.GetLastWin32Error());

        try
        {
            DOC_INFO_1 documentInfo = new DOC_INFO_1
            {
                pDocName = "Tuba Sofrasi receipt",
                pOutputFile = null,
                pDataType = "RAW"
            };
            int jobId = StartDocPrinter(printer, 1, ref documentInfo);
            if (jobId == 0)
                throw new Win32Exception(Marshal.GetLastWin32Error());

            try
            {
                if (!StartPagePrinter(printer))
                    throw new Win32Exception(Marshal.GetLastWin32Error());

                try
                {
                    IntPtr unmanagedBytes = Marshal.AllocHGlobal(bytes.Length);
                    try
                    {
                        Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
                        int written;
                        if (!WritePrinter(printer, unmanagedBytes, bytes.Length, out written))
                            throw new Win32Exception(Marshal.GetLastWin32Error());
                        if (written != bytes.Length)
                            throw new InvalidOperationException("Yazıcıya fişin tamamı gönderilemedi.");
                    }
                    finally
                    {
                        Marshal.FreeHGlobal(unmanagedBytes);
                    }
                }
                finally
                {
                    EndPagePrinter(printer);
                }
            }
            finally
            {
                EndDocPrinter(printer);
            }

            return jobId;
        }
        finally
        {
            ClosePrinter(printer);
        }
    }
}`;

module.exports = { listPrinters, printReceipt, createRawPrintScript };
// server.js  — MCP v2
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const PORT = 9123;
const EXEC_TIMEOUT = 60_000;
const OUTPUT_DIR = '/workspace/.ai-outputs';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const cdPrefix = String.raw`(?:cd\s+(?:\.?[\w\/\-]+(?:\/[\w\-]+)*)\s+&&\s+)?`;
const nodeScript = String.raw`${cdPrefix}node\s+\.?\/?(backend|scripts)\/[\w\-]+\.js$`;
const tsxScript  = String.raw`${cdPrefix}npx\s+tsx\s+\.?\/?(backend|scripts)\/[\w\-]+\.js$`;

/* ---------- allow-list ---------------------------------------------------- */
const allowList = [
  new RegExp(`^${cdPrefix}npx\\s+vitest\\b`, 'i'),
  new RegExp(`^${cdPrefix}npx\\s+tsc\\b.*--noEmit\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+install\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+run\\b`, 'i'),
  new RegExp(`^${cdPrefix}npm\\s+list\\b`, 'i'),
  new RegExp(`^${cdPrefix}node\\s+-v(?:ersion)?$`, 'i'),
  new RegExp(`^${cdPrefix}ls\\b`, 'i'),
  new RegExp(`^${cdPrefix}npx\\s+prisma\\s+(generate|format|validate|migrate\\s+(dev|status)|db\\s+pull)\\b`, 'i'),
  new RegExp(`^${cdPrefix}date\\b`, 'i'),
  new RegExp(nodeScript, 'i'),
  new RegExp(tsxScript, 'i')
];
const isAllowed = cmd => allowList.some(re => re.test(cmd.trim()));

/* ---------- express app --------------------------------------------------- */
const app = express();
app.use(express.json());
app.use(cors());

/* ---------- GET /logs/:file  ----------------------------------------------
 *  • Raw binary by default
 *  • Add ?b64=1  →  JSON  { base64: "<data>" }
 * ------------------------------------------------------------------------- */
app.get('/logs/:file', (req, res) => {
  const filePath = path.join(OUTPUT_DIR, req.params.file);
  if (!fs.existsSync(filePath)) return res.sendStatus(404);

  if (req.query.b64) {
    const data = fs.readFileSync(filePath);
    return res.json({ base64: data.toString('base64') });
  }
  res.sendFile(filePath);
});

/* ---------- POST /exec ---------------------------------------------------- */
app.post('/exec', (req, res) => {
  const { command = '' } = req.body || {};
  if (!command)             return res.status(400).json({ error: 'missing command' });
  if (!isAllowed(command))  return res.status(403).json({ error: 'command not permitted' });

  exec(
    command,
    { shell: true, cwd: '/workspace', timeout: EXEC_TIMEOUT, windowsHide: true, encoding: 'buffer' },
    (err, stdoutBuf, stderrBuf) => {
      const id   = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
      const out  = `${id}.out`;
      const errF = `${id}.err`;
      fs.writeFileSync(path.join(OUTPUT_DIR, out),  stdoutBuf);
      fs.writeFileSync(path.join(OUTPUT_DIR, errF), stderrBuf);

      const preview = buf =>
        buf.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '').slice(0, 1000);

      res.json({
        success: !err,
        exitCode: err?.code ?? 0,
        stdoutPreview: preview(stdoutBuf),
        stderrPreview: preview(stderrBuf),
        stdoutFile: `/logs/${out}`,
        stderrFile: `/logs/${errF}`
      });
    }
  );
});

app.listen(PORT, () =>
  console.log(`MCP listening on http://localhost:${PORT}/exec  (logs at /logs/*)`)
);

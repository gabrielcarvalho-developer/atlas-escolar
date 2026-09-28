import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const candidates =
  process.platform === 'win32'
    ? [path.join(projectRoot, 'python', '.venv', 'Scripts', 'python.exe')]
    : [path.join(projectRoot, 'python', '.venv', 'bin', 'python')];
const interpreter = candidates.find(existsSync);

if (!interpreter) {
  console.error(
    'Ambiente Python não encontrado. Crie-o com: python -m venv python/.venv',
  );
  process.exit(1);
}

const server = path.join(projectRoot, 'python', 'mcp_server.py');
const child = spawn(interpreter, [server, '--transport', 'sse'], {
  cwd: projectRoot,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(`Não foi possível iniciar o MCP: ${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

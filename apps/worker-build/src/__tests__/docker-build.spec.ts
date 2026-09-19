import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function dockerAvailable(): Promise<boolean> {
  try {
    await execFileAsync('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

describe('Docker build integration', () => {
  let buildDir: string;

  afterEach(async () => {
    if (buildDir) {
      await rm(buildDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('builds a Docker image from a Dockerfile and runs it', async () => {
    if (!(await dockerAvailable())) return;

    buildDir = await mkdtemp(join(tmpdir(), 'docker-test-'));
    await writeFile(
      join(buildDir, 'Dockerfile'),
      'FROM alpine:3.19\nRUN echo "hello from build" > /out.txt\nCMD ["cat", "/out.txt"]\n',
    );

    const imageTag = `test-worker-build:${Date.now()}`;

    try {
      await execFileAsync('docker', [
        'build', '-t', imageTag, '.',
      ], { cwd: buildDir, maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
    } catch (err: any) {
      const msg = err.stderr || err.stdout || err.message;
      if (msg.includes('no such host') || msg.includes('registry')) {
        console.log('Skipping: Docker Hub unreachable');
        return;
      }
      throw err;
    }

    const { stdout: runOut } = await execFileAsync('docker', [
      'run', '--rm', imageTag,
    ], { timeout: 10_000 });

    expect(runOut.trim()).toBe('hello from build');

    const { stdout: inspectOut } = await execFileAsync('docker', [
      'inspect', '--format={{.Id}}', imageTag,
    ], { timeout: 10_000 });

    expect(inspectOut.trim()).toMatch(/^sha256:/);

    await execFileAsync('docker', ['rmi', imageTag]).catch(() => {});
  }, 180_000);

  it('returns error output when Dockerfile has a build error', async () => {
    if (!(await dockerAvailable())) return;

    buildDir = await mkdtemp(join(tmpdir(), 'docker-fail-'));
    await writeFile(
      join(buildDir, 'Dockerfile'),
      'FROM alpine:3.19\nRUN nonexistent-command-xyz\n',
    );

    const imageTag = `test-fail-build:${Date.now()}`;

    try {
      await execFileAsync('docker', [
        'build', '-t', imageTag, '.',
      ], { cwd: buildDir, maxBuffer: 50 * 1024 * 1024, timeout: 120_000 });
      fail('Should have thrown');
    } catch (err: any) {
      const output = (err.stdout || '') + (err.stderr || '');
      if (output.includes('no such host') || output.includes('registry')) {
        console.log('Skipping: Docker Hub unreachable');
        return;
      }
      expect(err.code).not.toBe(0);
    }
  }, 180_000);

  it('returns error when no Dockerfile exists', async () => {
    if (!(await dockerAvailable())) return;

    buildDir = await mkdtemp(join(tmpdir(), 'docker-nodockerfile-'));
    const imageTag = `test-no-dockerfile:${Date.now()}`;

    try {
      await execFileAsync('docker', [
        'build', '-t', imageTag, '.',
      ], { cwd: buildDir, maxBuffer: 50 * 1024 * 1024, timeout: 30_000 });
      fail('Should have thrown');
    } catch (err: any) {
      expect(err.code).not.toBe(0);
    }
  }, 60_000);
});

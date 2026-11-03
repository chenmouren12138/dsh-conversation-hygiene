/**
 * Send one session artifact directory to the operating system's recycle bin.
 *
 * DSH stores each conversation as a directory under its session root. A purge
 * must remove that record from DSH, but the user asked for a recoverable final
 * step, so on Windows the directory is handed to the Shell's Recycle Bin
 * (`Microsoft.VisualBasic.FileIO.RecycleOption.SendToRecycleBin`) instead of
 * being unlinked. If the recycle bin is unavailable or the move fails, the
 * caller keeps the tombstone and reports a classified failure rather than
 * silently falling back to a permanent delete.
 */
import { spawn } from 'node:child_process'
import { exists } from './paths.js'

const POWERSHELL_TIMEOUT_MS = 30_000

function runPowerShell(script) {
  return new Promise((resolve, reject) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const child = spawn('powershell.exe', [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-EncodedCommand',
      encoded,
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve({ stdout, stderr })
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(Object.assign(new Error('system recycle bin timed out'), { code: 'recycle_bin_timeout' }))
    }, POWERSHELL_TIMEOUT_MS)

    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', (error) => finish(error))
    child.on('close', (code) => {
      if (code !== 0) {
        finish(Object.assign(new Error(stderr.trim() || `PowerShell exited with ${code}`), {
          code: 'recycle_bin_failed',
          exitCode: code,
        }))
      } else {
        finish()
      }
    })
  })
}

async function moveToWindowsRecycleBin(target) {
  const escaped = target.replace(/'/g, "''")
  const script = [
    "$ErrorActionPreference = 'Stop'",
    'Add-Type -AssemblyName Microsoft.VisualBasic',
    `$target = '${escaped}'`,
    'if ([System.IO.Directory]::Exists($target)) {',
    '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteDirectory(',
    '    $target,',
    '    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,',
    '    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin',
    '  )',
    '} elseif ([System.IO.File]::Exists($target)) {',
    '  [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(',
    '    $target,',
    '    [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,',
    '    [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin',
    '  )',
    '} else {',
    "  throw 'target does not exist'",
    '}',
  ].join('\n')
  await runPowerShell(script)
}

async function moveWithGio(target) {
  if (process.platform !== 'linux') return false
  await new Promise((resolve, reject) => {
    const child = spawn('gio', ['trash', target], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(Object.assign(new Error(stderr.trim() || `gio trash exited with ${code}`), { code: 'recycle_bin_failed' }))
    })
  })
  return true
}

/**
 * Move one existing file or directory to the OS recycle bin.
 * @returns {Promise<{ moved: boolean, missing?: boolean }>}
 */
export async function moveToOsRecycleBin(target) {
  if (!await exists(target)) return { moved: false, missing: true }

  if (process.platform === 'win32') {
    await moveToWindowsRecycleBin(target)
    return { moved: true }
  }
  if (await moveWithGio(target)) return { moved: true }

  throw Object.assign(
    new Error('this platform has no supported system recycle bin command'),
    { code: 'recycle_bin_unavailable' },
  )
}

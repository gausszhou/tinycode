export function isPathAllowed(absPath: string): boolean {
  return absPath.startsWith(process.cwd());
}

const DANGEROUS_PATTERNS: [RegExp, string][] = [
  [/rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s+(\/[^ ]*|~)/i, "Recursive force delete root or home directory"],
  [/rm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r)\s*$/i, "Recursive force delete without safe path"],
  [/mkfs/i, "Create filesystem, may destroy disk data"],
  [/dd\s+.*of=\/dev\//i, "Direct write to block device"],
  [/>\s*\/dev\/(sd|nvme|hd|xvd|vd)/i, "Redirect overwrite block device"],
  [/chmod\s+-R\s+777\s+\//i, "Dangerous global permission modification"],
  [/[:(]\s*\)\s*{\s*:\s*\|\s*:\s*&\s*}\s*;\s*:/, "Fork bomb"],
  [/>\s*\/etc\/(passwd|shadow|sudoers)/i, "Overwrite critical system files"],
  [/curl.*\|.*ba?sh/i, "Dangerous remote script pipe execution"],
];

export function checkDangerous(cmd: string): string | null {
  for (const [pattern, reason] of DANGEROUS_PATTERNS) {
    if (pattern.test(cmd)) return `Blocked dangerous command: ${reason}`;
  }
  return null;
}

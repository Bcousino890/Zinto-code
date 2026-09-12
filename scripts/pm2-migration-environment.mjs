function namedPm2Process(processes, processName) {
  const entry = processes.find((candidate) => candidate?.name === processName);
  if (!entry) {
    throw new Error(`PM2 process "${processName}" was not found`);
  }
  return entry;
}

/**
 * Return a child-process environment equivalent to the named PM2 process.
 *
 * PM2 stores the application environment in `pm2 jlist`; using it here keeps
 * one-off maintenance commands on the same database and credential set as the
 * running service. This module deliberately never prints environment values.
 */
export function environmentForPm2Process(processes, processName, baseEnvironment = process.env) {
  const entry = namedPm2Process(processes, processName);

  const pm2Environment = entry.pm2_env?.env ?? {};

  const safeEnvironment = Object.fromEntries(
    Object.entries(pm2Environment)
      .filter(([, value]) => typeof value === 'string')
      .map(([key, value]) => [key, value]),
  );

  return { ...baseEnvironment, ...safeEnvironment };
}

/** Return the dotenv file used by the PM2 application without reading it. */
export function dotenvPathForPm2Process(processes, processName, fallbackCwd = process.cwd()) {
  const entry = namedPm2Process(processes, processName);
  const cwd = typeof entry.pm2_env?.pm_cwd === 'string' ? entry.pm2_env.pm_cwd : fallbackCwd;
  return `${cwd.replace(/\/$/, '')}/.env`;
}

const RELAXED_TEST_PROJECT_IDS = new Set<string>();

function firebaseConfigProjectId(
  environment: NodeJS.ProcessEnv,
): string | undefined {
  const firebaseConfig = environment.FIREBASE_CONFIG;
  if (!firebaseConfig) return undefined;

  try {
    const parsed = JSON.parse(firebaseConfig) as { projectId?: unknown };
    return typeof parsed.projectId === 'string' ? parsed.projectId : undefined;
  } catch {
    return undefined;
  }
}

export function isFirebaseEmulator(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return environment.FUNCTIONS_EMULATOR === 'true';
}

export function isRelaxedTestEnvironment(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  if (isFirebaseEmulator(environment)) return true;

  const projectId =
    environment.GCLOUD_PROJECT ??
    environment.GOOGLE_CLOUD_PROJECT ??
    firebaseConfigProjectId(environment);

  return projectId !== undefined && RELAXED_TEST_PROJECT_IDS.has(projectId);
}

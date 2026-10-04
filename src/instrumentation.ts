// Runs once when the server starts: validate configuration so a misconfigured
// production deployment refuses to boot instead of running insecurely.
export async function onRequestError(err: unknown, request: { path: string }, context: { routeType?: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/server/monitoring");
  reportError(err, { kind: context.routeType ?? "request", route: request.path, digest: (err as { digest?: string })?.digest });
}

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { env } = await import("./lib/server/env");
    env();
    // Carry on with any listening-history import interrupted by the last restart.
    const { resumeImports } = await import("./lib/server/history-import");
    resumeImports();
  }
}

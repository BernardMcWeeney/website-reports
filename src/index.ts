import { generateMonthlyReport } from "./reporting";
import type { Env } from "./types";

interface WorkerExport {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response>;
  scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> | void;
}

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers ?? {})
    }
  });
}

function hasValidRunToken(request: Request, env: Env): boolean {
  if (!env.RUN_TOKEN) {
    return true;
  }
  return request.headers.get("x-run-token") === env.RUN_TOKEN;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

const worker: WorkerExport = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "website-reports-mvp",
        now: new Date().toISOString()
      });
    }

    if (url.pathname === "/run" && request.method === "GET") {
      if (!hasValidRunToken(request, env)) {
        return json({ ok: false, error: "Unauthorized" }, { status: 401 });
      }

      const monthOverride = url.searchParams.get("month") ?? undefined;

      try {
        const result = await generateMonthlyReport(env, {
          monthOverride,
          trigger: "manual"
        });
        return json({
          ok: true,
          month: result.monthKey,
          htmlKey: result.htmlKey,
          pdfKey: result.pdfKey,
          warnings: result.snapshot.warnings
        });
      } catch (error: unknown) {
        return json(
          {
            ok: false,
            error: errorMessage(error)
          },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        routes: ["/health", "/run?month=YYYY-MM"]
      });
    }

    return json({ ok: false, error: "Not found" }, { status: 404 });
  },

  async scheduled(controller, env, ctx) {
    void controller;
    ctx.waitUntil(
      generateMonthlyReport(env, {
        trigger: "scheduled"
      }).catch((error: unknown) => {
        console.error("Scheduled report generation failed", error);
      })
    );
  }
};

export default worker;

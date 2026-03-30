import type { Command } from "commander";
import { defaultRuntime } from "./runtime.js";
import type { ContinuityService } from "./service.js";
import type {
  ContinuityKind,
  ContinuityReviewState,
  ContinuityScopeKind,
  ContinuitySourceClass,
} from "./types.js";

function printPayload(payload: unknown, json?: boolean) {
  if (json) {
    defaultRuntime.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (typeof payload === "string") {
    defaultRuntime.log(payload);
    return;
  }
  defaultRuntime.log(JSON.stringify(payload, null, 2));
}

export function registerContinuityCli(params: {
  program: Command;
  ensureService: () => Promise<ContinuityService> | ContinuityService;
}) {
  const continuity = params.program
    .command("continuity")
    .description("Continuity review and recall commands");

  continuity
    .command("status")
    .option("--agent <id>", "Agent id")
    .option("--json", "JSON output", false)
    .action(async (opts: { agent?: string; json?: boolean }) => {
      const service = await params.ensureService();
      const status = await service.status(opts.agent);
      printPayload(status, opts.json);
    });

  continuity
    .command("review")
    .option("--agent <id>", "Agent id")
    .option("--state <state>", "State filter: pending|approved|rejected|all", "pending")
    .option("--kind <kind>", "Kind filter: fact|preference|decision|open_loop|all", "all")
    .option(
      "--source <source>",
      "Source filter: main_direct|paired_direct|group|channel|all",
      "all",
    )
    .option("--scope <scope>", "Scope filter: agent|subject|session|all", "all")
    .option("--subject <id>", "Subject id filter")
    .option("--limit <n>", "Result limit", "50")
    .option("--json", "JSON output", false)
    .action(
      async (opts: {
        agent?: string;
        state?: ContinuityReviewState | "all";
        kind?: ContinuityKind | "all";
        source?: ContinuitySourceClass | "all";
        scope?: ContinuityScopeKind | "all";
        subject?: string;
        limit: string;
        json?: boolean;
      }) => {
        const service = await params.ensureService();
        const records = await service.list({
          agentId: opts.agent,
          filters: {
            state: opts.state,
            kind: opts.kind,
            sourceClass: opts.source,
            scopeKind: opts.scope,
            subjectId: opts.subject,
            limit: Number.parseInt(opts.limit, 10) || 50,
          },
        });
        printPayload(records, opts.json);
      },
    );

  const registerPatch = (
    name: "approve" | "reject" | "rm",
    action: "approve" | "reject" | "remove",
  ) => {
    continuity
      .command(`${name} <id>`)
      .option("--agent <id>", "Agent id")
      .option("--json", "JSON output", false)
      .action(async (id: string, opts: { agent?: string; json?: boolean }) => {
        const service = await params.ensureService();
        const result = await service.patch({ agentId: opts.agent, id, action });
        printPayload(result, opts.json);
      });
  };

  registerPatch("approve", "approve");
  registerPatch("reject", "reject");
  registerPatch("rm", "remove");

  continuity
    .command("subjects")
    .option("--agent <id>", "Agent id")
    .option("--limit <n>", "Result limit", "50")
    .option("--json", "JSON output", false)
    .action(async (opts: { agent?: string; limit: string; json?: boolean }) => {
      const service = await params.ensureService();
      const result = await service.subjects({
        agentId: opts.agent,
        limit: Number.parseInt(opts.limit, 10) || 50,
      });
      printPayload(result, opts.json);
    });

  continuity
    .command("recent")
    .option("--agent <id>", "Agent id")
    .option("--subject <id>", "Subject id")
    .option("--session <key>", "Resolve the subject from a session key")
    .option("--limit <n>", "Result limit", "50")
    .option("--json", "JSON output", false)
    .action(
      async (opts: {
        agent?: string;
        subject?: string;
        session?: string;
        limit: string;
        json?: boolean;
      }) => {
        const service = await params.ensureService();
        const result = await service.recent({
          agentId: opts.agent,
          subjectId: opts.subject,
          sessionKey: opts.session,
          limit: Number.parseInt(opts.limit, 10) || 50,
        });
        printPayload(result, opts.json);
      },
    );
}

#!/usr/bin/env bun
import { createKomodoClient } from "./client.ts";

const [command, ...args] = process.argv.slice(2);

function usage(): never {
  console.error(`Usage: bun scripts/komodo/cli.ts <command> [args]

Commands:
  version                     Komodo core version
  stacks                      List stacks (name, server, status)
  stack <name>                Stack details (JSON)
  services <stack>            Services in a stack
  deploy <stack> [--poll]     Deploy stack (waits when --poll)
  pull <stack> [--poll]       Pull images for stack
  restart <stack> [--poll]    Restart stack
  stop <stack> [--poll]       Stop stack
  logs <stack> [tail]         Recent stack log lines (default tail: 200)
  containers [server]         Docker containers on server (all servers if omitted)
  servers                     List Komodo-managed servers
  update <id>                 Fetch update record by id

Env: repo root .env (KOMODO_URL, KOMODO_API_KEY, KOMODO_API_SECRET). Never commit secrets.
`);
  process.exit(command ? 1 : 0);
}

function stackArg(): string {
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    console.error("Missing stack name.");
    usage();
  }
  return name;
}

function wantsPoll(): boolean {
  return args.includes("--poll");
}

async function main(): Promise<void> {
  if (!command) usage();

  const komodo = createKomodoClient();

  switch (command) {
    case "version": {
      console.log(await komodo.core_version());
      break;
    }
    case "stacks": {
      const stacks = await komodo.read("ListStacks", {});
      for (const s of stacks) {
        const status = "status" in s ? String((s as { status?: string }).status) : "";
        const server = "server_id" in s ? String((s as { server_id?: string }).server_id) : "";
        console.log([s.name, server, status].filter(Boolean).join("\t"));
      }
      break;
    }
    case "stack": {
      const name = stackArg();
      const stack = await komodo.read("GetStack", { stack: name });
      console.log(JSON.stringify(stack, null, 2));
      break;
    }
    case "services": {
      const name = stackArg();
      const services = await komodo.read("ListStackServices", { stack: name });
      console.log(JSON.stringify(services, null, 2));
      break;
    }
    case "deploy":
    case "pull":
    case "restart":
    case "stop": {
      const name = stackArg();
      const poll = wantsPoll();
      const type =
        command === "deploy"
          ? "DeployStack"
          : command === "pull"
            ? "PullStack"
            : command === "restart"
              ? "RestartStack"
              : "StopStack";
      const result = poll
        ? await komodo.execute_and_poll(type, { stack: name })
        : await komodo.execute(type, { stack: name });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "logs": {
      const name = stackArg();
      const tailArg = args.filter((a) => !a.startsWith("-"))[1];
      const tail = tailArg ? Number(tailArg) : 200;
      const log = await komodo.read("GetStackLog", {
        stack: name,
        services: [],
        tail: Number.isFinite(tail) ? tail : 200,
      });
      if (typeof log === "string") {
        console.log(log);
      } else {
        console.log(JSON.stringify(log, null, 2));
      }
      break;
    }
    case "containers": {
      const server = args.find((a) => !a.startsWith("-"));
      const containers = server
        ? await komodo.read("ListDockerContainers", { server })
        : await komodo.read("ListAllDockerContainers", {});
      console.log(JSON.stringify(containers, null, 2));
      break;
    }
    case "servers": {
      const servers = await komodo.read("ListServers", {});
      for (const s of servers) {
        console.log([s.name, s.id].join("\t"));
      }
      break;
    }
    case "update": {
      const id = args[0];
      if (!id) {
        console.error("Missing update id.");
        usage();
      }
      const update = await komodo.read("GetUpdate", { id });
      console.log(JSON.stringify(update, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      usage();
  }
}

main().catch((err) => {
  const message =
    err && typeof err === "object" && "result" in err
      ? JSON.stringify((err as { status?: number; result?: unknown }).result, null, 2)
      : err instanceof Error
        ? err.message
        : String(err);
  console.error(message);
  process.exit(1);
});

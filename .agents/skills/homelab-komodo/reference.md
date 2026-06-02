# Komodo client API cheat sheet (homelab)

Official: [komodo_client on npm](https://www.npmjs.com/package/komodo_client), [Rust API index](https://docs.rs/komodo_client/latest/komodo_client/).

Client shape:

```ts
const komodo = KomodoClient(url, {
  type: "api-key",
  params: { key, secret },
});
```

## Read (inspection)

| Type | Typical params | Use |
|------|----------------|-----|
| `ListStacks` | `{}` | All stacks |
| `GetStack` | `{ stack }` | Stack config + state |
| `ListStackServices` | `{ stack }` | Compose services |
| `GetStackLog` | `{ stack, tail? }` | Deploy/runtime log |
| `GetStackActionState` | `{ stack }` | In-progress stack operations |
| `ListServers` | `{}` | Hosts |
| `ListDockerContainers` | `{ server }` | Containers on one server |
| `ListAllDockerContainers` | `{}` | All containers |
| `GetContainerLog` | see Types | Single container logs |
| `GetUpdate` | `{ id }` | Deploy job record |
| `ListUpdates` | `{}` | Recent updates |
| `ListVariables` | `{}` | Global variables |

## Execute

Most stack operations accept `{ stack: "<name>" }` (aliases `st` may exist in API).

| Type | Effect |
|------|--------|
| `DeployStack` | Deploy / apply stack |
| `DeployStackIfChanged` | Deploy only if changed |
| `PullStack` | Pull images |
| `RestartStack` | Restart |
| `StartStack` | Start |
| `StopStack` | Stop |
| `DestroyStack` | Remove stack resources (destructive) |
| `RunStackService` | Run one service |

Container-level (server + container id): `StartContainer`, `RestartContainer`, `StopContainer`, `DestroyContainer`.

Use `execute` for fire-and-forget; `execute_and_poll` to block until `Update` status is complete.

## Write (configuration)

Use only when explicitly changing Komodo resources: `UpdateStack`, `CreateStack`, `UpdateVariableValue`, etc. Misconfiguration can break production stacks—prefer UI for one-off secret edits unless the user wants automation.

## Batch

`BatchDeployStack`, `BatchPullStack`, … — multiple targets in one request; response may be an array of updates/errors.

## Types

Import `Types` from `komodo_client` for enums and nested config shapes when writing scripts beyond the CLI.

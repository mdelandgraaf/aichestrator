# AIChestrator

Multi-agent AI orchestrator that commands multiple Claude agents simultaneously for parallel task execution.

## Architecture

- **Orchestrator**: Central coordinator that decomposes tasks and manages workers
- **Worker Agents**: Subprocess-based Claude agents executing subtasks in parallel
- **Shared Memory**: Redis-backed state for inter-agent communication
- **Event Bus**: Pub/sub coordination via Redis

## Key Files

- `src/cli.ts` - Command-line interface entry point
- `src/orchestrator/orchestrator.ts` - Main coordination logic
- `src/workers/worker-process.ts` - Worker subprocess entry
- `src/memory/shared-memory.ts` - Redis state management

## Running

```bash
# Start Redis
docker-compose up -d

# Run a task
npm run dev -- run "your task description" --project /path/to/project
```

## Development

```bash
npm install
npm run typecheck
npm test
```

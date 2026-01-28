# AIChestrator

Multi-agent AI orchestrator that commands multiple Claude agents simultaneously to complete complex tasks autonomously.

## Features

- **Parallel Execution**: Break complex tasks into subtasks executed by multiple agents in parallel
  - Independent work (frontend + backend) runs simultaneously
  - Dependent work (testing after implementation) waits for prerequisites
- **Specialized Agents**: Different agent types for different tasks:
  - `researcher` - Analyzes codebases, finds patterns and dependencies
  - `implementer` - Writes and modifies code
  - `reviewer` - Reviews code quality and security
  - `tester` - Writes and runs tests
  - `documenter` - Creates documentation
- **Intelligent Failure Handling**: When tasks fail, the system analyzes why and decides to:
  - **Retry** with a modified approach
  - **Decompose** into smaller, more manageable subtasks
  - **Skip** if non-critical to the overall goal
  - **Fail** only if truly unrecoverable
- **Shared Memory**: Redis-based coordination allows agents to share discoveries in real-time
- **Project Context**: Agents read `CLAUDE.md` from your project for guidelines
- **Status Tracking**: Progress tracked in `.aichestrator/status.md`
- **Tool Use**: Agents can read/write files, run commands, and search the web
- **Crash Recovery**: Worker crashes are handled gracefully with automatic retry

## Installation

```bash
# Clone the repository
git clone https://github.com/mdelandgraaf/aichestrator.git
cd aichestrator

# Install dependencies
npm install

# Build
npm run build
```

## Requirements

- Node.js 18+
- Redis server running on localhost:6379
- Anthropic API key

## Configuration

Create a `.env` file:

```env
ANTHROPIC_API_KEY=your-api-key-here
LOG_LEVEL=warn
```

### Project Context (CLAUDE.md)

Create a `CLAUDE.md` file in your project root to give agents project-specific context:

```markdown
# Project Guidelines

- Use TypeScript strict mode
- Follow existing patterns in src/utils/
- All new features need tests
- Use pnpm, not npm
```

## Usage

### Basic Usage

```bash
# Run a task
npm start -- run "Create a hello world TypeScript file" --project ./my-project

# Run with a markdown file as task description
npm start -- run @task.md --project ./my-project

# Specify max workers
npm start -- run "Add user authentication" --project ./my-project --max-workers 4
```

### Allow Software Installation

By default, agents cannot install software. Use `--allow-install` to permit installation commands:

```bash
# Allow npm install, pip install, apt-get, etc.
npm start -- run "Set up a new React project with dependencies" --allow-install
```

This enables:
- `npm install`, `yarn add`, `pnpm add`
- `pip install`
- `sudo apt-get install`, `sudo yum install`
- `cargo add`, `go get`

### CLI Options

```
Options:
  -p, --project <path>      Path to the project directory (default: current dir)
  -t, --type <type>         Task type: feature, bugfix, refactor, research
  -w, --max-workers <n>     Maximum parallel workers (default: 4)
  -s, --strategy <s>        Strategy: parallel, hierarchical (default: parallel)
  --timeout <ms>            Timeout in milliseconds (default: 300000)
  --allow-install           Allow workers to install software (npm, pip, apt-get, etc.)
  --verbose                 Show detailed output
```

### Resume Failed Tasks

If a task fails with some subtasks incomplete, you can resume without starting over:

```bash
# Resume a failed task (re-runs only failed subtasks)
npm start -- resume <task-id>
```

This keeps results from successful subtasks and only re-runs the failed ones.

### Other Commands

```bash
# Check task status
npm start -- status <task-id>

# List agents
npm start -- agents

# Check system health
npm start -- health

# Ping Redis
npm start -- ping
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Orchestrator                           │
│  • Task decomposition (parallel/hierarchical)               │
│  • Intelligent scheduling (respects dependencies)           │
│  • Failure remediation (retry/decompose/skip/fail)          │
│  • Result aggregation                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │ fork()
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌───────────┐ ┌───────────┐ ┌───────────┐
   │ Worker 1  │ │ Worker 2  │ │ Worker 3  │
   │ Claude    │ │ Claude    │ │ Claude    │
   └─────┬─────┘ └─────┬─────┘ └─────┬─────┘
         │             │             │
         └─────────────┼─────────────┘
                       ▼
              Redis (Shared Memory)
              • Task state & progress
              • Shared discoveries
              • Agent heartbeats
```

## How Agents Work Together

1. **Decomposition**: The orchestrator breaks your task into subtasks with dependencies
2. **Parallel Execution**: Independent subtasks run simultaneously (e.g., frontend + backend)
3. **Sequential Dependencies**: Dependent tasks wait (e.g., testing waits for implementation)
4. **Shared Context**: Agents share discoveries via Redis - later agents see earlier findings
5. **Intelligent Remediation**: Failed tasks get analyzed and retried with better approaches

Example task decomposition for "Add user authentication":
```
[Parallel]
├── [researcher] Analyze existing auth patterns
├── [researcher] Research JWT best practices
│
[After research completes]
├── [implementer] Create auth middleware
├── [implementer] Add login/logout endpoints
├── [implementer] Create user model
│
[After implementation completes]
├── [tester] Write auth tests
├── [reviewer] Review security
│
[After all completes]
└── [documenter] Document auth API
```

## Agent Tools

Each agent has access to:

| Tool | Description |
|------|-------------|
| `read_file` | Read file contents |
| `write_file` | Create/modify files |
| `list_files` | List directory contents |
| `run_command` | Execute shell commands |
| `web_search` | Search the web for documentation |
| `fetch_url` | Fetch content from URLs |

## Output

All runs create logs and status in the project directory:

```
my-project/
└── .aichestrator/
    ├── status.md                           # Real-time worker status
    └── run-2024-01-27T22-24-34-780Z.log   # Full execution log
```

### Status File

The `status.md` file shows real-time progress:

```markdown
# AIChestrator Status Report

### ✅ [2024-01-27T22:24:35Z] IMPLEMENTER (abc123)
**Status:** completed
**Task:** Create user authentication middleware
**Details:**
Duration: 45.2s
Files: src/middleware/auth.ts, src/types/auth.ts
Summary: Created JWT-based auth middleware...
---
```

## Development

```bash
# Run in development mode
npm run dev -- run "your task"

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint
```

## License

MIT

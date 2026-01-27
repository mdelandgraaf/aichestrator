# AIChestrator

Multi-agent AI orchestrator that commands multiple Claude agents simultaneously to complete complex tasks autonomously.

## Features

- **Parallel Execution**: Break complex tasks into smaller subtasks executed by multiple agents in parallel
- **Specialized Agents**: Different agent types for different tasks:
  - `implementer` - Writes code
  - `researcher` - Analyzes codebases
  - `reviewer` - Reviews code quality
  - `tester` - Writes tests
  - `documenter` - Creates documentation
- **Shared Memory**: Redis-based coordination allows agents to share discoveries
- **Tool Use**: Agents can read/write files, run commands, and search the web
- **File Logging**: All output saved to `.aichestrator/` directory

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

### CLI Options

```
Options:
  -p, --project <path>      Path to the project directory (default: current dir)
  -t, --type <type>         Task type: feature, bugfix, refactor, research
  -w, --max-workers <n>     Maximum parallel workers (default: 4)
  -s, --strategy <s>        Strategy: parallel, hierarchical (default: parallel)
  --timeout <ms>            Timeout in milliseconds (default: 300000)
  --verbose                 Show detailed output
```

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
│  • Task decomposition                                       │
│  • Agent spawning & scheduling                              │
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
```

## Agent Tools

Each agent has access to:

- `read_file` - Read file contents
- `write_file` - Create/modify files
- `list_files` - List directory contents
- `run_command` - Execute shell commands
- `web_search` - Search the web for documentation
- `fetch_url` - Fetch content from URLs

## Output

All runs create a log file in the project directory:

```
my-project/
└── .aichestrator/
    └── run-2024-01-27T22-24-34-780Z.log
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

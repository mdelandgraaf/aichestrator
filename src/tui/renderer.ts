import { TUIStore, AgentState } from './store.js';

// ANSI escape codes
const ESC = '\x1b';
const CSI = `${ESC}[`;
const CLEAR_SCREEN = `${CSI}2J${CSI}H`;
const HIDE_CURSOR = `${CSI}?25l`;
const SHOW_CURSOR = `${CSI}?25h`;
const ALT_SCREEN_ON = `${CSI}?1049h`;
const ALT_SCREEN_OFF = `${CSI}?1049l`;
const BOLD = `${CSI}1m`;
const DIM = `${CSI}2m`;
const RESET = `${CSI}0m`;
const GREEN = `${CSI}32m`;
const YELLOW = `${CSI}33m`;
const RED = `${CSI}31m`;
const CYAN = `${CSI}36m`;
const WHITE = `${CSI}37m`;
const BG_BLUE = `${CSI}44m`;
const INVERSE = `${CSI}7m`;

// Box drawing
const BOX = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  ml: '├', mr: '┤', mt: '┬', mb: '┴',
  cross: '┼'
};

function moveTo(row: number, col: number): string {
  return `${CSI}${row};${col}H`;
}

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.substring(0, len - 1) + '…';
}

function pad(str: string, len: number): string {
  if (str.length >= len) return str.substring(0, len);
  return str + ' '.repeat(len - str.length);
}

function elapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

function statusIcon(status: string): string {
  switch (status) {
    case 'completed': return `${GREEN}✓${RESET}`;
    case 'failed': return `${RED}✗${RESET}`;
    case 'executing': return `${YELLOW}●${RESET}`;
    case 'queued': return `${CYAN}○${RESET}`;
    default: return `${DIM}·${RESET}`;
  }
}

function statusColor(status: string): string {
  switch (status) {
    case 'completed': return GREEN;
    case 'failed': return RED;
    case 'executing': return YELLOW;
    case 'queued': return CYAN;
    default: return DIM;
  }
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

export class TUIRenderer {
  private store: TUIStore;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastRender = 0;
  private renderQueued = false;

  constructor(store: TUIStore) {
    this.store = store;
  }

  start(): void {
    process.stdout.write(ALT_SCREEN_ON + HIDE_CURSOR + CLEAR_SCREEN);
    this.store.on('change', () => this.queueRender());
    this.timer = setInterval(() => this.render(), 1000);
    this.render();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    process.stdout.write(SHOW_CURSOR + ALT_SCREEN_OFF);
  }

  private queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    const sinceLast = Date.now() - this.lastRender;
    const delay = Math.max(0, 33 - sinceLast);
    setTimeout(() => {
      this.renderQueued = false;
      this.render();
    }, delay);
  }

  private render(): void {
    this.lastRender = Date.now();
    const state = this.store.getState();
    const cols = process.stdout.columns || 120;
    const rows = process.stdout.rows || 40;

    const buf: string[] = [];
    buf.push(CLEAR_SCREEN);

    // === Header bar (row 1) ===
    const elapsedStr = elapsed(Date.now() - state.startTime);
    const phaseStr = state.phase.charAt(0).toUpperCase() + state.phase.slice(1);
    const progressStr = `${state.completedSubtasks}/${state.totalSubtasks} subtasks`;
    const failStr = state.failedSubtasks > 0 ? ` ${RED}${state.failedSubtasks} failed${RESET}` : '';
    const headerContent = ` AIChestrator ${DIM}──${RESET} ${phaseStr} ${DIM}──${RESET} ${progressStr}${failStr} ${DIM}──${RESET} ${elapsedStr} `;
    buf.push(moveTo(1, 1) + BG_BLUE + WHITE + BOLD + pad(headerContent, cols) + RESET);

    // === Task description (row 2) ===
    buf.push(moveTo(2, 1) + DIM + ' ' + truncate(state.taskDescription, cols - 2) + RESET);

    // Layout: 3 panels in top half, output in bottom half
    const panelStartRow = 3;
    const dividerRow = Math.max(panelStartRow + 6, Math.floor(rows * 0.55));
    const outputStartRow = dividerRow + 1;
    const footerRow = rows;
    const outputEndRow = footerRow - 1;

    // Panel widths (divide screen into 3)
    const panel1Width = Math.floor(cols * 0.30);
    const panel2Width = Math.floor(cols * 0.35);
    const panel3Width = cols - panel1Width - panel2Width;

    const panelHeight = dividerRow - panelStartRow;

    // === Draw 3 panels ===
    this.drawPanel(buf, 'orchestrator', 'Orchestrator', panelStartRow, 1, panel1Width, panelHeight,
      state.activePanel === 'orchestrator', state.orchestratorLog, undefined);

    this.drawSubtasksPanel(buf, panelStartRow, panel1Width + 1, panel2Width, panelHeight,
      state.activePanel === 'subtasks', state);

    this.drawAgentsPanel(buf, panelStartRow, panel1Width + panel2Width + 1, panel3Width, panelHeight,
      state.activePanel === 'agents', state);

    // === Divider with selected info ===
    const selectedAgent = this.store.getSelectedAgent();
    const selectedSubtask = this.store.getSelectedSubtask();
    let divLabel = ' Output ';
    if (state.activePanel === 'agents' && selectedAgent) {
      divLabel = ` Agent: ${selectedAgent.id.substring(0, 8)} ${DIM}──${RESET} ${selectedAgent.stage || 'idle'} `;
    } else if (state.activePanel === 'subtasks' && selectedSubtask) {
      const agent = selectedSubtask.assignedAgentId ? state.agents.get(selectedSubtask.assignedAgentId) : undefined;
      if (agent) {
        divLabel = ` Subtask → Agent: ${agent.id.substring(0, 8)} ${DIM}──${RESET} ${agent.stage || 'idle'} `;
      } else {
        divLabel = ` Subtask: ${selectedSubtask.id.substring(0, 8)} ${DIM}──${RESET} ${selectedSubtask.status} `;
      }
    }
    const divLine = BOX.ml + BOX.h + divLabel + BOX.h.repeat(Math.max(0, cols - stripAnsi(divLabel).length - 3)) + BOX.mr;
    buf.push(moveTo(dividerRow, 1) + divLine);

    // === Output pane ===
    const outputRows = outputEndRow - outputStartRow + 1;
    let outputAgent: AgentState | undefined;

    if (state.activePanel === 'agents') {
      outputAgent = selectedAgent;
    } else if (state.activePanel === 'subtasks' && selectedSubtask?.assignedAgentId) {
      outputAgent = state.agents.get(selectedSubtask.assignedAgentId);
    }

    if (outputAgent && outputAgent.outputLines.length > 0) {
      const lines = outputAgent.outputLines;
      const startLine = Math.max(0, lines.length - outputRows);
      for (let i = 0; i < outputRows; i++) {
        const lineIdx = startLine + i;
        const row = outputStartRow + i;
        const text = lineIdx < lines.length ? lines[lineIdx]! : '';
        buf.push(moveTo(row, 1) + ' ' + truncate(text, cols - 2) + CSI + 'K');
      }
    } else {
      for (let i = 0; i < outputRows; i++) {
        buf.push(moveTo(outputStartRow + i, 1) + CSI + 'K');
      }
      const msg = state.agentOrder.length === 0 ? 'Waiting for agents...' : 'Select a subtask or agent with ↑↓, switch panels with ←→';
      buf.push(moveTo(outputStartRow + Math.floor(outputRows / 2), Math.floor((cols - msg.length) / 2)) + DIM + msg + RESET);
    }

    // === Footer ===
    const footer = ` ${BOLD}←→${RESET}/${BOLD}Tab${RESET} Panels  ${BOLD}↑↓${RESET} Select  ${BOLD}x${RESET} Cancel  ${BOLD}q${RESET} Quit`;
    buf.push(moveTo(footerRow, 1) + BG_BLUE + WHITE + pad(footer, cols) + RESET);

    // === Error overlay ===
    if (state.error) {
      const errMsg = `ERROR: ${truncate(state.error, cols - 10)}`;
      buf.push(moveTo(panelStartRow, 1) + RED + BOLD + errMsg + RESET);
    }

    process.stdout.write(buf.join(''));
  }

  private drawPanel(buf: string[], _id: string, title: string, startRow: number, startCol: number,
    width: number, height: number, active: boolean, lines: string[], _selectedIdx?: number): void {

    const borderColor = active ? CYAN : DIM;
    const titleStr = ` ${title} `;

    // Top border
    const topBorder = borderColor + BOX.tl + BOX.h + (active ? BOLD : '') + titleStr + RESET + borderColor +
      BOX.h.repeat(Math.max(0, width - titleStr.length - 3)) + BOX.tr + RESET;
    buf.push(moveTo(startRow, startCol) + topBorder);

    // Content rows
    const contentHeight = height - 2;
    const startLine = Math.max(0, lines.length - contentHeight);
    for (let i = 0; i < contentHeight; i++) {
      const row = startRow + 1 + i;
      const lineIdx = startLine + i;
      const text = lineIdx < lines.length ? lines[lineIdx]! : '';
      const content = ' ' + truncate(text, width - 4) + ' ';
      buf.push(moveTo(row, startCol) + borderColor + BOX.v + RESET + pad(content, width - 2) + borderColor + BOX.v + RESET);
    }

    // Bottom border
    buf.push(moveTo(startRow + height - 1, startCol) + borderColor + BOX.bl + BOX.h.repeat(width - 2) + BOX.br + RESET);
  }

  private drawSubtasksPanel(buf: string[], startRow: number, startCol: number,
    width: number, height: number, active: boolean, state: Readonly<ReturnType<TUIStore['getState']>>): void {

    const borderColor = active ? CYAN : DIM;
    const title = ` Subtasks (${state.subtaskOrder.length}) `;

    // Top border
    const topBorder = borderColor + BOX.tl + BOX.h + (active ? BOLD : '') + title + RESET + borderColor +
      BOX.h.repeat(Math.max(0, width - stripAnsi(title).length - 3)) + BOX.tr + RESET;
    buf.push(moveTo(startRow, startCol) + topBorder);

    // Content rows
    const contentHeight = height - 2;
    const subtasks = state.subtaskOrder.map((id) => state.subtasks.get(id)!).filter(Boolean);

    for (let i = 0; i < contentHeight; i++) {
      const row = startRow + 1 + i;
      const subtask = subtasks[i];
      let content = '';

      if (subtask) {
        const selected = active && i === state.subtaskSelectedIndex;
        const icon = statusIcon(subtask.status);
        const shortId = subtask.id.substring(0, 6);
        const desc = truncate(subtask.description, width - 18);
        const line = ` ${icon} ${DIM}${shortId}${RESET} ${statusColor(subtask.status)}${subtask.agentType.substring(0, 8).padEnd(8)}${RESET} ${desc}`;

        if (selected) {
          content = INVERSE + stripAnsi(line).padEnd(width - 2) + RESET;
        } else {
          content = line;
        }
      }

      buf.push(moveTo(row, startCol) + borderColor + BOX.v + RESET + pad(content, width - 2) + borderColor + BOX.v + RESET);
    }

    // Bottom border
    buf.push(moveTo(startRow + height - 1, startCol) + borderColor + BOX.bl + BOX.h.repeat(width - 2) + BOX.br + RESET);
  }

  private drawAgentsPanel(buf: string[], startRow: number, startCol: number,
    width: number, height: number, active: boolean, state: Readonly<ReturnType<TUIStore['getState']>>): void {

    const borderColor = active ? CYAN : DIM;
    const runningCount = Array.from(state.agents.values()).filter((a) => a.status === 'executing').length;
    const title = ` Agents (${runningCount} running) `;

    // Top border
    const topBorder = borderColor + BOX.tl + BOX.h + (active ? BOLD : '') + title + RESET + borderColor +
      BOX.h.repeat(Math.max(0, width - stripAnsi(title).length - 3)) + BOX.tr + RESET;
    buf.push(moveTo(startRow, startCol) + topBorder);

    // Content rows
    const contentHeight = height - 2;
    const agents = state.agentOrder.map((id) => state.agents.get(id)!).filter(Boolean);

    for (let i = 0; i < contentHeight; i++) {
      const row = startRow + 1 + i;
      const agent = agents[i];
      let content = '';

      if (agent) {
        const selected = active && i === state.agentSelectedIndex;
        const icon = statusIcon(agent.status);
        const shortId = agent.id.substring(0, 6);
        const agentElapsed = agent.completedAt
          ? elapsed(agent.completedAt - agent.startedAt)
          : elapsed(Date.now() - agent.startedAt);
        const line = ` ${icon} ${DIM}${shortId}${RESET} ${statusColor(agent.status)}${agent.agentType.substring(0, 8).padEnd(8)}${RESET} ${agentElapsed.padStart(5)}`;

        if (selected) {
          content = INVERSE + stripAnsi(line).padEnd(width - 2) + RESET;
        } else {
          content = line;
        }
      }

      buf.push(moveTo(row, startCol) + borderColor + BOX.v + RESET + pad(content, width - 2) + borderColor + BOX.v + RESET);
    }

    // Bottom border
    buf.push(moveTo(startRow + height - 1, startCol) + borderColor + BOX.bl + BOX.h.repeat(width - 2) + BOX.br + RESET);
  }
}

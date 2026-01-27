import { AgentType } from '../config/schema.js';
import { SharedMemory } from '../memory/shared-memory.js';
import { createLogger, Logger } from '../utils/logger.js';

export interface AggregatedResult {
  summary: {
    total: number;
    successful: number;
    failed: number;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  byAgentType: Record<AgentType, {
    count: number;
    successful: number;
    failed: number;
    avgDurationMs: number;
  }>;
  outputs: Array<{
    subtaskId: string;
    agentType: AgentType;
    description: string;
    output: unknown;
    durationMs: number;
  }>;
  errors: Array<{
    subtaskId: string;
    agentType: AgentType;
    description: string;
    error: string;
    attempts: number;
  }>;
  insights: string[];
  filesModified: string[];
  timeline: Array<{
    subtaskId: string;
    agentType: AgentType;
    startTime: number;
    endTime: number;
    success: boolean;
  }>;
}

export class ResultAggregator {
  private memory: SharedMemory;
  private logger: Logger;

  constructor(memory: SharedMemory) {
    this.memory = memory;
    this.logger = createLogger('aggregator');
  }

  /**
   * Aggregate all results for a task
   */
  async aggregate(taskId: string): Promise<AggregatedResult> {
    const results = await this.memory.getResults(taskId);
    const subtasks = await this.memory.getSubtasksForTask(taskId);
    const context = await this.memory.getContext(taskId);

    // Create subtask lookup map
    const subtaskMap = new Map(subtasks.map((s) => [s.id, s]));

    // Initialize result structure
    const aggregated: AggregatedResult = {
      summary: {
        total: results.length,
        successful: 0,
        failed: 0,
        totalDurationMs: 0,
        avgDurationMs: 0
      },
      byAgentType: {} as Record<AgentType, any>,
      outputs: [],
      errors: [],
      insights: [],
      filesModified: [],
      timeline: []
    };

    // Initialize agent type stats
    const agentTypes: AgentType[] = ['researcher', 'implementer', 'reviewer', 'tester', 'documenter'];
    for (const type of agentTypes) {
      aggregated.byAgentType[type] = {
        count: 0,
        successful: 0,
        failed: 0,
        avgDurationMs: 0
      };
    }

    // Process each result
    const agentDurations: Record<AgentType, number[]> = {
      researcher: [],
      implementer: [],
      reviewer: [],
      tester: [],
      documenter: []
    };

    for (const result of results) {
      const subtask = subtaskMap.get(result.subtaskId);
      if (!subtask) continue;

      const agentType = subtask.agentType;

      // Update summary
      aggregated.summary.totalDurationMs += result.executionMs;
      if (result.success) {
        aggregated.summary.successful++;
        aggregated.byAgentType[agentType].successful++;
      } else {
        aggregated.summary.failed++;
        aggregated.byAgentType[agentType].failed++;
      }

      // Update agent type stats
      aggregated.byAgentType[agentType].count++;
      agentDurations[agentType].push(result.executionMs);

      // Add to outputs or errors
      if (result.success) {
        aggregated.outputs.push({
          subtaskId: result.subtaskId,
          agentType,
          description: subtask.description,
          output: result.output,
          durationMs: result.executionMs
        });
      } else {
        aggregated.errors.push({
          subtaskId: result.subtaskId,
          agentType,
          description: subtask.description,
          error: result.error ?? 'Unknown error',
          attempts: subtask.attempts
        });
      }

      // Add to timeline
      aggregated.timeline.push({
        subtaskId: result.subtaskId,
        agentType,
        startTime: subtask.createdAt,
        endTime: subtask.updatedAt,
        success: result.success
      });
    }

    // Calculate averages
    if (results.length > 0) {
      aggregated.summary.avgDurationMs = Math.round(
        aggregated.summary.totalDurationMs / results.length
      );
    }

    for (const type of agentTypes) {
      const durations = agentDurations[type];
      if (durations.length > 0) {
        aggregated.byAgentType[type].avgDurationMs = Math.round(
          durations.reduce((a, b) => a + b, 0) / durations.length
        );
      }
    }

    // Extract insights from context
    if (context) {
      for (const discovery of context.discoveries) {
        if (discovery.type === 'insight') {
          const data = discovery.data as { text?: string };
          if (data.text) {
            aggregated.insights.push(data.text);
          }
        } else if (discovery.type === 'file') {
          const data = discovery.data as { path?: string };
          if (data.path) {
            aggregated.filesModified.push(data.path);
          }
        }
      }
    }

    // Deduplicate files
    aggregated.filesModified = [...new Set(aggregated.filesModified)];

    // Sort timeline by start time
    aggregated.timeline.sort((a, b) => a.startTime - b.startTime);

    this.logger.info(
      {
        taskId,
        total: aggregated.summary.total,
        successful: aggregated.summary.successful,
        failed: aggregated.summary.failed
      },
      'Results aggregated'
    );

    return aggregated;
  }

  /**
   * Generate a human-readable summary
   */
  generateSummary(result: AggregatedResult): string {
    const lines: string[] = [];

    // Overall summary
    lines.push('## Task Summary\n');
    lines.push(`- **Total Subtasks:** ${result.summary.total}`);
    lines.push(`- **Successful:** ${result.summary.successful}`);
    lines.push(`- **Failed:** ${result.summary.failed}`);
    lines.push(`- **Total Duration:** ${(result.summary.totalDurationMs / 1000).toFixed(1)}s`);
    lines.push(`- **Average Duration:** ${(result.summary.avgDurationMs / 1000).toFixed(1)}s`);
    lines.push('');

    // Agent breakdown
    lines.push('## Agent Performance\n');
    for (const [type, stats] of Object.entries(result.byAgentType)) {
      if (stats.count > 0) {
        lines.push(`### ${type.charAt(0).toUpperCase() + type.slice(1)}`);
        lines.push(`- Tasks: ${stats.count} (${stats.successful} success, ${stats.failed} failed)`);
        lines.push(`- Avg Duration: ${(stats.avgDurationMs / 1000).toFixed(1)}s`);
        lines.push('');
      }
    }

    // Key insights
    if (result.insights.length > 0) {
      lines.push('## Key Insights\n');
      for (const insight of result.insights) {
        lines.push(`- ${insight}`);
      }
      lines.push('');
    }

    // Files modified
    if (result.filesModified.length > 0) {
      lines.push('## Files Affected\n');
      for (const file of result.filesModified) {
        lines.push(`- ${file}`);
      }
      lines.push('');
    }

    // Errors
    if (result.errors.length > 0) {
      lines.push('## Errors\n');
      for (const error of result.errors) {
        lines.push(`### ${error.agentType}: ${error.description.substring(0, 50)}...`);
        lines.push(`- Error: ${error.error}`);
        lines.push(`- Attempts: ${error.attempts}`);
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /**
   * Merge outputs from all successful subtasks
   */
  mergeOutputs(result: AggregatedResult): string {
    const sections: string[] = [];

    // Group by agent type in logical order
    const order: AgentType[] = ['researcher', 'implementer', 'tester', 'reviewer', 'documenter'];

    for (const agentType of order) {
      const outputs = result.outputs.filter((o) => o.agentType === agentType);
      if (outputs.length === 0) continue;

      sections.push(`## ${agentType.charAt(0).toUpperCase() + agentType.slice(1)} Output\n`);

      for (const output of outputs) {
        sections.push(`### ${output.description}\n`);
        if (typeof output.output === 'string') {
          sections.push(output.output);
        } else {
          sections.push(JSON.stringify(output.output, null, 2));
        }
        sections.push('');
      }
    }

    return sections.join('\n');
  }
}

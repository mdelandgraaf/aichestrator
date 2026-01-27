import Anthropic from '@anthropic-ai/sdk';
import { Task, AgentTypeSchema } from '../../config/schema.js';
import { BaseDecompositionStrategy, DecompositionResult } from './base-strategy.js';
import { createLogger, Logger } from '../../utils/logger.js';

interface HierarchicalNode {
  description: string;
  agentType: string;
  children: HierarchicalNode[];
  estimatedComplexity: number;
}

/**
 * Hierarchical decomposition strategy
 * Breaks tasks into a tree structure, then flattens with proper dependencies
 */
export class HierarchicalStrategy extends BaseDecompositionStrategy {
  name = 'hierarchical';
  private client: Anthropic;
  private model: string;
  private logger: Logger;
  private maxDepth: number;

  constructor(apiKey: string, model: string, maxDepth: number = 3) {
    super();
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.maxDepth = maxDepth;
    this.logger = createLogger('hierarchical-strategy');
  }

  async decompose(task: Task): Promise<DecompositionResult[]> {
    this.logger.info({ taskId: task.id }, 'Decomposing with hierarchical strategy');

    // First, get the high-level phases
    const phases = await this.decomposeIntoPhases(task);

    // Then, decompose each phase if needed
    const expandedPhases: HierarchicalNode[] = [];
    for (const phase of phases) {
      if (phase.estimatedComplexity > 2 && phase.children.length === 0) {
        // Complex phase needs further decomposition
        const subPhases = await this.expandPhase(task, phase, 1);
        phase.children = subPhases;
      }
      expandedPhases.push(phase);
    }

    // Flatten the tree into a linear list with dependencies
    const results = this.flattenTree(expandedPhases);
    this.validateResults(results);

    this.logger.info(
      { taskId: task.id, subtaskCount: results.length },
      'Hierarchical decomposition complete'
    );

    return results;
  }

  private async decomposeIntoPhases(task: Task): Promise<HierarchicalNode[]> {
    const prompt = `Break this task into HIGH-LEVEL PHASES:

## Task
Type: ${task.type}
Description: ${task.description}
Project: ${task.projectPath}

Return JSON with phases in execution order:
{
  "phases": [
    {
      "description": "Phase description",
      "agentType": "researcher|implementer|reviewer|tester|documenter",
      "children": [],
      "estimatedComplexity": 1-5
    }
  ]
}

Typical phases:
1. Research/Analysis phase (understand the codebase)
2. Implementation phases (one per major component)
3. Testing phase
4. Review phase
5. Documentation phase (if needed)`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: 'You are a software architect. Break tasks into logical phases.',
      messages: [{ role: 'user', content: prompt }]
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response');
    }

    return this.parsePhases(textContent.text);
  }

  private async expandPhase(
    task: Task,
    phase: HierarchicalNode,
    depth: number
  ): Promise<HierarchicalNode[]> {
    if (depth >= this.maxDepth) {
      return [];
    }

    const prompt = `Expand this phase into smaller subtasks:

## Original Task
${task.description}

## Phase to Expand
${phase.description}
Agent Type: ${phase.agentType}
Complexity: ${phase.estimatedComplexity}

Return JSON with subtasks:
{
  "subtasks": [
    {
      "description": "Subtask description",
      "agentType": "${phase.agentType}",
      "children": [],
      "estimatedComplexity": 1-5
    }
  ]
}

Keep subtasks focused and atomic. Use the same agent type as the parent unless there's a good reason to change.`;

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      system: 'You are a task decomposition expert. Break phases into atomic subtasks.',
      messages: [{ role: 'user', content: prompt }]
    });

    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return [];
    }

    try {
      const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as { subtasks: HierarchicalNode[] };
      return parsed.subtasks;
    } catch {
      return [];
    }
  }

  private parsePhases(text: string): HierarchicalNode[] {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as { phases: HierarchicalNode[] };

    // Validate agent types
    for (const phase of parsed.phases) {
      const result = AgentTypeSchema.safeParse(phase.agentType);
      if (!result.success) {
        phase.agentType = 'implementer';
      }
    }

    return parsed.phases;
  }

  private flattenTree(nodes: HierarchicalNode[]): DecompositionResult[] {
    const results: DecompositionResult[] = [];
    const nodeIndices = new Map<HierarchicalNode, number>();

    // First pass: flatten all nodes and assign indices
    const flatten = (node: HierarchicalNode, parentIndex: number | null): void => {
      const index = results.length;
      nodeIndices.set(node, index);

      const dependencies: number[] = [];

      // Depend on parent if exists
      if (parentIndex !== null) {
        dependencies.push(parentIndex);
      }

      // Depend on previous sibling's subtree (sequential within same level)
      // This is commented out to allow more parallelism
      // If you want strict sequential execution within phases, uncomment:
      // if (results.length > 0 && parentIndex !== null) {
      //   dependencies.push(results.length - 1);
      // }

      results.push({
        description: node.description,
        agentType: AgentTypeSchema.parse(node.agentType),
        dependencies,
        estimatedComplexity: node.estimatedComplexity,
        priority: parentIndex === null ? 1 : 2
      });

      // Process children
      for (const child of node.children) {
        flatten(child, index);
      }
    };

    // Process top-level nodes sequentially (phases depend on previous phases)
    let previousPhaseLastIndex: number | null = null;
    for (const node of nodes) {
      const currentIndex = results.length;

      // Top-level phases depend on the completion of the previous phase
      if (previousPhaseLastIndex !== null) {
        // We'll add this dependency after flattening
      }

      flatten(node, null);

      // Update dependencies for sequential phases
      if (previousPhaseLastIndex !== null && currentIndex < results.length) {
        results[currentIndex]!.dependencies.push(previousPhaseLastIndex);
      }

      previousPhaseLastIndex = results.length - 1;
    }

    return results;
  }
}

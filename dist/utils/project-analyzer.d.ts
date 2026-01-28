export type ProjectType = 'android' | 'ios' | 'node' | 'python' | 'rust' | 'go' | 'java' | 'dotnet' | 'flutter' | 'unknown';
export interface ProjectAnalysis {
    isGreenfield: boolean;
    projectType: ProjectType;
    hasPackageManager: boolean;
    hasBuildSystem: boolean;
    missingSetup: string[];
    existingFiles: string[];
    recommendations: string[];
}
export declare class ProjectAnalyzer {
    private logger;
    constructor();
    /**
     * Analyze a project directory to determine its state and type
     */
    analyze(projectPath: string): ProjectAnalysis;
    /**
     * Get all files in a directory up to a certain depth
     */
    private getAllFiles;
    /**
     * Determine if a project is greenfield (empty or near-empty)
     */
    private isGreenfieldProject;
    /**
     * Detect the project type based on files and task description
     */
    private detectProjectType;
    /**
     * Check if the project has a build system configured
     */
    private hasBuildSystem;
    /**
     * Check if package manager is available
     */
    private hasPackageManager;
    /**
     * Create a greenfield result with recommendations
     */
    private createGreenfieldResult;
    /**
     * Detect project type from task description when project is empty
     */
    detectTypeFromDescription(description: string): ProjectType;
    /**
     * Get build commands for a project type
     */
    getBuildCommands(type: ProjectType): string[];
    /**
     * Get setup commands for a project type
     */
    getSetupCommands(type: ProjectType): string[];
}
export declare const projectAnalyzer: ProjectAnalyzer;
//# sourceMappingURL=project-analyzer.d.ts.map
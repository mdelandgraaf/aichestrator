import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { createLogger, Logger } from './logger.js';

export type ProjectType =
  | 'android'
  | 'ios'
  | 'node'
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'dotnet'
  | 'flutter'
  | 'unknown';

export interface ProjectAnalysis {
  isGreenfield: boolean;
  projectType: ProjectType;
  hasPackageManager: boolean;
  hasBuildSystem: boolean;
  missingSetup: string[];
  existingFiles: string[];
  recommendations: string[];
}

interface ProjectTypeDetector {
  type: ProjectType;
  indicators: string[];
  buildFiles: string[];
  packageManager?: string[];
  setupCommands: string[];
  buildCommands: string[];
}

const PROJECT_DETECTORS: ProjectTypeDetector[] = [
  {
    type: 'android',
    indicators: ['app/src/main', 'AndroidManifest.xml', '.kt', '.java', 'android'],
    buildFiles: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradlew'],
    packageManager: ['gradlew', 'gradle'],
    setupCommands: [
      'Initialize Android project with gradle init --type kotlin-application',
      'Or use Android Studio to create project scaffolding',
      'Run gradle wrapper to create gradlew script'
    ],
    buildCommands: ['./gradlew assembleDebug', './gradlew build']
  },
  {
    type: 'ios',
    indicators: ['.xcodeproj', '.xcworkspace', 'Podfile', '.swift', 'Info.plist'],
    buildFiles: ['Package.swift', 'Podfile', '*.xcodeproj'],
    packageManager: ['pod', 'swift'],
    setupCommands: ['pod install', 'swift package init'],
    buildCommands: ['xcodebuild', 'swift build']
  },
  {
    type: 'node',
    indicators: ['package.json', 'node_modules', '.js', '.ts', 'tsconfig.json'],
    buildFiles: ['package.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
    packageManager: ['npm', 'yarn', 'pnpm'],
    setupCommands: ['npm init -y', 'npm install'],
    buildCommands: ['npm run build', 'npm test']
  },
  {
    type: 'python',
    indicators: ['requirements.txt', 'setup.py', 'pyproject.toml', '.py', 'Pipfile'],
    buildFiles: ['requirements.txt', 'setup.py', 'pyproject.toml', 'Pipfile'],
    packageManager: ['pip', 'pipenv', 'poetry'],
    setupCommands: ['pip install -r requirements.txt', 'poetry install'],
    buildCommands: ['python -m pytest', 'python setup.py build']
  },
  {
    type: 'rust',
    indicators: ['Cargo.toml', 'Cargo.lock', '.rs', 'src/main.rs', 'src/lib.rs'],
    buildFiles: ['Cargo.toml', 'Cargo.lock'],
    packageManager: ['cargo'],
    setupCommands: ['cargo init', 'cargo new project_name'],
    buildCommands: ['cargo build --release', 'cargo test']
  },
  {
    type: 'go',
    indicators: ['go.mod', 'go.sum', '.go', 'main.go'],
    buildFiles: ['go.mod', 'go.sum'],
    packageManager: ['go'],
    setupCommands: ['go mod init module_name', 'go mod tidy'],
    buildCommands: ['go build', 'go test ./...']
  },
  {
    type: 'java',
    indicators: ['pom.xml', 'build.gradle', '.java', 'src/main/java'],
    buildFiles: ['pom.xml', 'build.gradle', 'gradlew', 'mvnw'],
    packageManager: ['maven', 'gradle'],
    setupCommands: ['mvn archetype:generate', 'gradle init'],
    buildCommands: ['mvn package', 'gradle build']
  },
  {
    type: 'dotnet',
    indicators: ['.csproj', '.sln', '.cs', 'Program.cs', 'appsettings.json'],
    buildFiles: ['*.csproj', '*.sln', 'Directory.Build.props'],
    packageManager: ['dotnet', 'nuget'],
    setupCommands: ['dotnet new console', 'dotnet restore'],
    buildCommands: ['dotnet build', 'dotnet publish']
  },
  {
    type: 'flutter',
    indicators: ['pubspec.yaml', 'lib/main.dart', '.dart', 'android/app', 'ios/Runner'],
    buildFiles: ['pubspec.yaml', 'pubspec.lock'],
    packageManager: ['flutter', 'dart'],
    setupCommands: ['flutter create .', 'flutter pub get'],
    buildCommands: ['flutter build apk', 'flutter build ios']
  }
];

export class ProjectAnalyzer {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('project-analyzer');
  }

  /**
   * Analyze a project directory to determine its state and type
   */
  analyze(projectPath: string): ProjectAnalysis {
    this.logger.info({ projectPath }, 'Analyzing project');

    if (!existsSync(projectPath)) {
      return this.createGreenfieldResult('unknown', [
        'Project directory does not exist - needs to be created'
      ]);
    }

    const files = this.getAllFiles(projectPath, 3); // Scan up to 3 levels deep
    const isGreenfield = this.isGreenfieldProject(files);
    const projectType = this.detectProjectType(projectPath, files);
    const detector = PROJECT_DETECTORS.find((d) => d.type === projectType);

    const hasBuildSystem = detector ? this.hasBuildSystem(files, detector) : false;
    const hasPackageManager = detector ? this.hasPackageManager(projectPath, detector) : false;

    const missingSetup: string[] = [];
    const recommendations: string[] = [];

    if (isGreenfield) {
      missingSetup.push('Project is empty or nearly empty');
      if (projectType !== 'unknown') {
        recommendations.push(`Initialize ${projectType} project structure`);
        if (detector) {
          recommendations.push(...detector.setupCommands);
        }
      }
    } else {
      if (!hasBuildSystem && detector) {
        missingSetup.push(`Missing build system files: ${detector.buildFiles.join(', ')}`);
        recommendations.push(`Create build configuration for ${projectType}`);
      }
      if (!hasPackageManager && detector) {
        missingSetup.push('Package manager not configured');
        recommendations.push(...detector.setupCommands);
      }
    }

    // Add build verification recommendation
    if (detector && !isGreenfield) {
      recommendations.push(`Verify build with: ${detector.buildCommands.join(' or ')}`);
    }

    const result: ProjectAnalysis = {
      isGreenfield,
      projectType,
      hasPackageManager,
      hasBuildSystem,
      missingSetup,
      existingFiles: files.slice(0, 50), // Limit for logging
      recommendations
    };

    this.logger.info({ projectPath, isGreenfield, projectType, hasBuildSystem }, 'Project analysis complete');

    return result;
  }

  /**
   * Get all files in a directory up to a certain depth
   */
  private getAllFiles(dir: string, maxDepth: number, currentDepth: number = 0): string[] {
    if (currentDepth > maxDepth) return [];

    const files: string[] = [];

    try {
      const entries = readdirSync(dir);

      for (const entry of entries) {
        // Skip common non-essential directories
        if (
          entry === 'node_modules' ||
          entry === '.git' ||
          entry === '.aichestrator' ||
          entry === 'build' ||
          entry === 'dist' ||
          entry === '__pycache__' ||
          entry === '.gradle' ||
          entry === '.idea'
        ) {
          continue;
        }

        const fullPath = join(dir, entry);
        const relativePath = fullPath.replace(dir + '/', '');

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            files.push(relativePath + '/');
            files.push(...this.getAllFiles(fullPath, maxDepth, currentDepth + 1).map((f) => join(relativePath, f)));
          } else {
            files.push(relativePath);
          }
        } catch {
          // Skip files we can't stat
        }
      }
    } catch {
      // Directory might not exist or be readable
    }

    return files;
  }

  /**
   * Determine if a project is greenfield (empty or near-empty)
   */
  private isGreenfieldProject(files: string[]): boolean {
    // Filter out meta files that don't count as project content
    const meaningfulFiles = files.filter((f) => {
      const name = f.toLowerCase();
      return (
        !name.endsWith('/') &&
        !name.startsWith('.') &&
        name !== 'readme.md' &&
        name !== 'license' &&
        name !== 'license.md' &&
        !name.includes('.aichestrator/')
      );
    });

    // Less than 3 meaningful files = greenfield
    return meaningfulFiles.length < 3;
  }

  /**
   * Detect the project type based on files and task description
   */
  private detectProjectType(_projectPath: string, files: string[]): ProjectType {
    const fileString = files.join(' ').toLowerCase();

    // Check each detector's indicators
    for (const detector of PROJECT_DETECTORS) {
      let matches = 0;
      for (const indicator of detector.indicators) {
        if (indicator.startsWith('.')) {
          // File extension check
          if (files.some((f) => f.endsWith(indicator))) {
            matches++;
          }
        } else if (fileString.includes(indicator.toLowerCase())) {
          matches++;
        }
      }

      // Need at least 2 indicators to match
      if (matches >= 2) {
        return detector.type;
      }
    }

    // Check for specific files that are strong indicators
    for (const file of files) {
      const name = file.toLowerCase();
      if (name === 'package.json') return 'node';
      if (name === 'cargo.toml') return 'rust';
      if (name === 'go.mod') return 'go';
      if (name === 'pom.xml' || name === 'build.gradle') return 'java';
      if (name === 'pubspec.yaml') return 'flutter';
      if (name === 'requirements.txt' || name === 'pyproject.toml') return 'python';
      if (name.includes('androidmanifest.xml') || name.includes('build.gradle.kts')) return 'android';
    }

    return 'unknown';
  }

  /**
   * Check if the project has a build system configured
   */
  private hasBuildSystem(files: string[], detector: ProjectTypeDetector): boolean {
    for (const buildFile of detector.buildFiles) {
      if (buildFile.includes('*')) {
        // Wildcard pattern
        const pattern = buildFile.replace('*', '');
        if (files.some((f) => f.includes(pattern))) {
          return true;
        }
      } else if (files.some((f) => f.toLowerCase().endsWith(buildFile.toLowerCase()))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if package manager is available
   */
  private hasPackageManager(projectPath: string, detector: ProjectTypeDetector): boolean {
    // For now, just check if key package manager files exist
    const files = this.getAllFiles(projectPath, 1);

    for (const buildFile of detector.buildFiles) {
      if (files.some((f) => f.toLowerCase() === buildFile.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Create a greenfield result with recommendations
   */
  private createGreenfieldResult(type: ProjectType, missingSetup: string[]): ProjectAnalysis {
    return {
      isGreenfield: true,
      projectType: type,
      hasPackageManager: false,
      hasBuildSystem: false,
      missingSetup,
      existingFiles: [],
      recommendations: [`Create project directory and initialize ${type} project`]
    };
  }

  /**
   * Detect project type from task description when project is empty
   */
  detectTypeFromDescription(description: string): ProjectType {
    const desc = description.toLowerCase();

    if (desc.includes('android') || desc.includes('kotlin') || desc.includes('apk')) {
      return 'android';
    }
    if (desc.includes('ios') || desc.includes('swift') || desc.includes('xcode')) {
      return 'ios';
    }
    if (desc.includes('flutter') || desc.includes('dart')) {
      return 'flutter';
    }
    if (desc.includes('react') || desc.includes('node') || desc.includes('npm') || desc.includes('typescript')) {
      return 'node';
    }
    if (desc.includes('python') || desc.includes('pip') || desc.includes('django') || desc.includes('flask')) {
      return 'python';
    }
    if (desc.includes('rust') || desc.includes('cargo')) {
      return 'rust';
    }
    if (desc.includes('golang') || desc.includes('go module')) {
      return 'go';
    }
    if (desc.includes('.net') || desc.includes('c#') || desc.includes('dotnet')) {
      return 'dotnet';
    }

    return 'unknown';
  }

  /**
   * Get build commands for a project type
   */
  getBuildCommands(type: ProjectType): string[] {
    const detector = PROJECT_DETECTORS.find((d) => d.type === type);
    return detector?.buildCommands ?? [];
  }

  /**
   * Get setup commands for a project type
   */
  getSetupCommands(type: ProjectType): string[] {
    const detector = PROJECT_DETECTORS.find((d) => d.type === type);
    return detector?.setupCommands ?? [];
  }
}

export const projectAnalyzer = new ProjectAnalyzer();

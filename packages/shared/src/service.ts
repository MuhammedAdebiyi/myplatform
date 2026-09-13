export enum ServiceType {
  WEB_SERVICE = 'WEB_SERVICE',
  WORKER = 'WORKER',
  CRON_JOB = 'CRON_JOB',
  STATIC_SITE = 'STATIC_SITE',
  PRIVATE_SERVICE = 'PRIVATE_SERVICE',
}

export enum DeploymentStrategy {
  RECREATE = 'RECREATE',
  ROLLING = 'ROLLING',
  BLUE_GREEN = 'BLUE_GREEN',
  CANARY = 'CANARY',
}

export enum RestartPolicy {
  ALWAYS = 'ALWAYS',
  ON_FAILURE = 'ON_FAILURE',
  NEVER = 'NEVER',
}

export enum DeploymentStatus {
  PENDING = 'PENDING',
  BUILDING = 'BUILDING',
  DEPLOYING = 'DEPLOYING',
  HEALTHY = 'HEALTHY',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
}

export interface ServiceResources {
  cpuRequest: number;
  cpuLimit: number;
  memRequestMb: number;
  memLimitMb: number;
  diskMb: number;
  replicas: number;
}

export interface ServiceDefinition {
  name: string;
  type: ServiceType;
  region: string;
  image?: string;
  buildCommand?: string;
  startCommand?: string;
  resources: ServiceResources;
  restartPolicy: RestartPolicy;
  deploymentStrategy: DeploymentStrategy;
}

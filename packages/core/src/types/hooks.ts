/**
 * Core hook type definitions for the Open Agent System
 * Provides 50 extensibility points across 7 categories
 */

import type { z } from 'zod';

// =============================================================================
// Base Types
// =============================================================================

export type HookPriority = 'critical' | 'high' | 'normal' | 'low';

export interface HookMetadata {
  readonly id: string;
  readonly name: string;
  readonly category: HookCategory;
  readonly priority: HookPriority;
  readonly description?: string;
  readonly version?: string;
}

export type HookCategory =
  | 'gateway'
  | 'auth'
  | 'tool-calling'
  | 'agent-lifecycle'
  | 'streaming'
  | 'observability'
  | 'security';

export type HookResult<T> =
  | { success: true; data: T; metadata?: Record<string, unknown> }
  | { success: false; error: Error; recoverable: boolean };

export type HookHandler<TInput, TOutput> = (
  input: TInput,
  context: HookContext
) => Promise<HookResult<TOutput>>;

export interface HookContext {
  readonly requestId: string;
  readonly timestamp: number;
  readonly traceId?: string;
  readonly spanId?: string;
  readonly metadata: Record<string, unknown>;
  signal?: AbortSignal;
}

// =============================================================================
// Category 1: Gateway Hooks (#1-7)
// =============================================================================

export interface RequestTransformInput {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
  metadata?: Record<string, unknown>;
}

export interface RequestTransformOutput extends RequestTransformInput {
  transformed: boolean;
}

export interface ResponseTransformInput {
  response: LLMResponse;
  originalRequest: RequestTransformInput;
}

export interface ResponseTransformOutput {
  response: LLMResponse;
  transformed: boolean;
}

export interface ModelSelectionInput {
  request: RequestTransformInput;
  availableModels: ModelInfo[];
  constraints?: ModelConstraints;
}

export interface ModelSelectionOutput {
  selectedModel: string;
  fallbackModels: string[];
  reason: string;
}

export interface ProviderRoutingInput {
  model: string;
  availableProviders: ProviderInfo[];
  preferences?: ProviderPreferences;
}

export interface ProviderRoutingOutput {
  provider: string;
  fallbackProviders: string[];
  estimatedLatency?: number;
  estimatedCost?: number;
}

export interface FallbackTriggerInput {
  error: Error;
  failedProvider: string;
  failedModel: string;
  attemptNumber: number;
  remainingFallbacks: string[];
}

export interface FallbackTriggerOutput {
  shouldFallback: boolean;
  nextProvider?: string;
  nextModel?: string;
  delay?: number;
}

export interface RetryDecisionInput {
  error: Error;
  attemptNumber: number;
  maxAttempts: number;
  request: RequestTransformInput;
}

export interface RetryDecisionOutput {
  shouldRetry: boolean;
  delay: number;
  modifiedRequest?: RequestTransformInput;
}

export interface CircuitBreakerInput {
  provider: string;
  model: string;
  recentFailures: FailureRecord[];
  currentState: 'closed' | 'open' | 'half-open';
}

export interface CircuitBreakerOutput {
  newState: 'closed' | 'open' | 'half-open';
  allowRequest: boolean;
  cooldownMs?: number;
}

// =============================================================================
// Category 2: Authentication & Authorization Hooks (#8-14)
// =============================================================================

export interface ApiKeyValidationInput {
  apiKey: string;
  provider: string;
  requestedScopes?: string[];
}

export interface ApiKeyValidationOutput {
  valid: boolean;
  scopes: string[];
  expiresAt?: number;
  metadata?: Record<string, unknown>;
}

export interface ApiKeyRotationInput {
  currentKey: string;
  provider: string;
  reason: 'expiration' | 'security' | 'scheduled';
}

export interface ApiKeyRotationOutput {
  newKey: string;
  validFrom: number;
  oldKeyValidUntil?: number;
}

export interface PermissionCheckInput {
  userId: string;
  resource: string;
  action: string;
  context?: Record<string, unknown>;
}

export interface PermissionCheckOutput {
  allowed: boolean;
  reason?: string;
  restrictions?: string[];
}

export interface RateLimitInput {
  identifier: string;
  resource: string;
  currentUsage: number;
  limit: number;
  windowMs: number;
}

export interface RateLimitOutput {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface QuotaCheckInput {
  userId: string;
  quotaType: 'tokens' | 'requests' | 'cost';
  requestedAmount: number;
  currentUsage: number;
  limit: number;
}

export interface QuotaCheckOutput {
  allowed: boolean;
  remaining: number;
  overage?: number;
  upgradeOptions?: string[];
}

export interface SessionValidationInput {
  sessionId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionValidationOutput {
  valid: boolean;
  userId: string;
  permissions: string[];
  expiresAt: number;
}

export interface AuditLogInput {
  event: string;
  userId?: string;
  resource?: string;
  action: string;
  outcome: 'success' | 'failure' | 'denied';
  metadata?: Record<string, unknown>;
}

export interface AuditLogOutput {
  logged: boolean;
  auditId: string;
  timestamp: number;
}

// =============================================================================
// Category 3: Tool Calling Hooks (#15-21)
// =============================================================================

export interface ToolRegistrationInput {
  tool: ToolDefinition;
  source: 'builtin' | 'plugin' | 'mcp' | 'custom';
}

export interface ToolRegistrationOutput {
  registered: boolean;
  toolId: string;
  conflicts?: string[];
}

export interface ToolValidationInput {
  tool: ToolDefinition;
  schema?: z.ZodSchema;
}

export interface ToolValidationOutput {
  valid: boolean;
  errors?: ValidationError[];
  warnings?: string[];
}

export interface ToolExecutionInput {
  toolId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  timeout?: number;
}

export interface ToolExecutionOutput {
  result: unknown;
  duration: number;
  metadata?: Record<string, unknown>;
}

export interface ToolResultTransformInput {
  toolId: string;
  rawResult: unknown;
  expectedFormat?: string;
}

export interface ToolResultTransformOutput {
  result: unknown;
  transformed: boolean;
  format: string;
}

export interface ToolErrorRecoveryInput {
  toolId: string;
  error: Error;
  arguments: Record<string, unknown>;
  attemptNumber: number;
}

export interface ToolErrorRecoveryOutput {
  recovered: boolean;
  result?: unknown;
  fallbackTool?: string;
  userMessage?: string;
}

export interface McpToolDiscoveryInput {
  serverUri: string;
  capabilities?: string[];
}

export interface McpToolDiscoveryOutput {
  tools: ToolDefinition[];
  serverInfo: McpServerInfo;
  connected: boolean;
}

export interface ToolSandboxInput {
  toolId: string;
  code?: string;
  permissions: string[];
  resourceLimits?: ResourceLimits;
}

export interface ToolSandboxOutput {
  sandboxId: string;
  isolated: boolean;
  restrictions: string[];
}

// =============================================================================
// Category 4: Agent Lifecycle Hooks (#22-28)
// =============================================================================

export interface AgentInitInput {
  agentId: string;
  config: AgentConfig;
  parentAgentId?: string;
}

export interface AgentInitOutput {
  initialized: boolean;
  agentId: string;
  capabilities: string[];
}

export interface AgentSpawnInput {
  parentAgentId: string;
  childConfig: AgentConfig;
  delegatedTask?: string;
  inheritPermissions: boolean;
}

export interface AgentSpawnOutput {
  childAgentId: string;
  spawned: boolean;
  inheritedCapabilities: string[];
}

export interface AgentTerminationInput {
  agentId: string;
  reason: 'completed' | 'timeout' | 'error' | 'cancelled' | 'resource-limit';
  finalState?: Record<string, unknown>;
}

export interface AgentTerminationOutput {
  terminated: boolean;
  cleanupCompleted: boolean;
  orphanedResources?: string[];
}

export interface StateTransitionInput {
  agentId: string;
  fromState: AgentState;
  toState: AgentState;
  trigger: string;
}

export interface StateTransitionOutput {
  allowed: boolean;
  newState: AgentState;
  sideEffects?: string[];
}

export interface MessagePassingInput {
  fromAgentId: string;
  toAgentId: string;
  message: AgentMessage;
  priority?: 'high' | 'normal' | 'low';
}

export interface MessagePassingOutput {
  delivered: boolean;
  messageId: string;
  queuePosition?: number;
}

export interface TaskDelegationInput {
  parentAgentId: string;
  task: TaskDefinition;
  targetAgentId?: string;
  selectionCriteria?: AgentSelectionCriteria;
}

export interface TaskDelegationOutput {
  delegated: boolean;
  assignedAgentId: string;
  estimatedCompletion?: number;
}

export interface AgentHealthCheckInput {
  agentId: string;
  checks: ('memory' | 'responsiveness' | 'task-queue' | 'connections')[];
}

export interface AgentHealthCheckOutput {
  healthy: boolean;
  metrics: HealthMetrics;
  recommendations?: string[];
}

// =============================================================================
// Category 5: Streaming Hooks (#29-35)
// =============================================================================

export interface StreamStartInput {
  requestId: string;
  model: string;
  estimatedTokens?: number;
}

export interface StreamStartOutput {
  streamId: string;
  started: boolean;
  bufferSize?: number;
}

export interface ChunkProcessInput {
  streamId: string;
  chunk: StreamChunk;
  chunkIndex: number;
  totalChunks?: number;
}

export interface ChunkProcessOutput {
  processed: boolean;
  transformedChunk?: StreamChunk;
  metadata?: Record<string, unknown>;
}

export interface StreamCompleteInput {
  streamId: string;
  totalChunks: number;
  totalTokens: number;
  duration: number;
}

export interface StreamCompleteOutput {
  completed: boolean;
  finalMetrics: StreamMetrics;
}

export interface StreamErrorInput {
  streamId: string;
  error: Error;
  chunksReceived: number;
  partialContent?: string;
}

export interface StreamErrorOutput {
  handled: boolean;
  recovery?: 'resume' | 'restart' | 'abort';
  userMessage?: string;
}

export interface BackpressureInput {
  streamId: string;
  bufferUtilization: number;
  processingRate: number;
  incomingRate: number;
}

export interface BackpressureOutput {
  action: 'continue' | 'slow' | 'pause' | 'drop';
  targetRate?: number;
  bufferAction?: 'expand' | 'flush' | 'maintain';
}

export interface StreamMultiplexInput {
  streams: string[];
  mergeStrategy: 'interleave' | 'sequential' | 'priority';
}

export interface StreamMultiplexOutput {
  multiplexId: string;
  streamOrder: string[];
  bufferAllocations: Record<string, number>;
}

export interface PartialResultInput {
  streamId: string;
  accumulatedContent: string;
  structureDetected?: 'json' | 'code' | 'markdown' | 'text';
}

export interface PartialResultOutput {
  parsedPartial?: unknown;
  confidence: number;
  suggestions?: string[];
}

// =============================================================================
// Category 6: Observability Hooks (#36-42)
// =============================================================================

export interface MetricCollectionInput {
  metricName: string;
  value: number;
  labels: Record<string, string>;
  timestamp?: number;
}

export interface MetricCollectionOutput {
  recorded: boolean;
  aggregated?: number;
  alerts?: string[];
}

export interface TraceStartInput {
  operationName: string;
  parentSpanId?: string;
  attributes?: Record<string, unknown>;
}

export interface TraceStartOutput {
  traceId: string;
  spanId: string;
  sampled: boolean;
}

export interface SpanAnnotationInput {
  spanId: string;
  key: string;
  value: unknown;
  timestamp?: number;
}

export interface SpanAnnotationOutput {
  annotated: boolean;
  spanDuration?: number;
}

export interface LogEnrichmentInput {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

export interface LogEnrichmentOutput {
  enrichedMessage: string;
  additionalFields: Record<string, unknown>;
  shouldLog: boolean;
}

export interface AlertTriggerInput {
  alertName: string;
  severity: 'info' | 'warning' | 'critical';
  condition: string;
  currentValue: number;
  threshold: number;
}

export interface AlertTriggerOutput {
  triggered: boolean;
  alertId?: string;
  notificationsSent?: string[];
}

export interface CostTrackingInput {
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cached?: boolean;
}

export interface CostTrackingOutput {
  cost: number;
  currency: string;
  budgetRemaining?: number;
  projectedMonthlyCost?: number;
}

export interface PerformanceProfilingInput {
  operation: string;
  startTime: number;
  endTime: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceProfilingOutput {
  duration: number;
  percentile?: number;
  baseline?: number;
  anomaly?: boolean;
}

// =============================================================================
// Category 7: Security & Guardrails Hooks (#43-50)
// =============================================================================

export interface InputSanitizationInput {
  content: string;
  contentType: 'user-message' | 'system-prompt' | 'tool-argument';
  rules?: SanitizationRule[];
}

export interface InputSanitizationOutput {
  sanitized: string;
  modifications: SanitizationModification[];
  blocked: boolean;
}

export interface OutputFilteringInput {
  content: string;
  filters: OutputFilter[];
  context?: Record<string, unknown>;
}

export interface OutputFilteringOutput {
  filtered: string;
  redactions: Redaction[];
  blocked: boolean;
}

export interface PiiDetectionInput {
  content: string;
  piiTypes: PiiType[];
  threshold?: number;
}

export interface PiiDetectionOutput {
  detected: PiiMatch[];
  risk: 'none' | 'low' | 'medium' | 'high';
  recommendations: string[];
}

export interface PromptInjectionInput {
  content: string;
  source: 'user' | 'tool' | 'external';
  knownPatterns?: string[];
}

export interface PromptInjectionOutput {
  detected: boolean;
  confidence: number;
  patterns: string[];
  action: 'allow' | 'warn' | 'block';
}

export interface ContentModerationInput {
  content: string;
  categories: ModerationCategory[];
  strictness: 'lenient' | 'moderate' | 'strict';
}

export interface ContentModerationOutput {
  passed: boolean;
  violations: ModerationViolation[];
  scores: Record<string, number>;
}

export interface DataEncryptionInput {
  data: unknown;
  algorithm?: string;
  keyId?: string;
}

export interface DataEncryptionOutput {
  encrypted: string;
  algorithm: string;
  keyId: string;
  iv?: string;
}

export interface ComplianceCheckInput {
  operation: string;
  data?: unknown;
  regulations: ('gdpr' | 'hipaa' | 'ccpa' | 'sox')[];
}

export interface ComplianceCheckOutput {
  compliant: boolean;
  violations: ComplianceViolation[];
  requiredActions?: string[];
}

export interface ThreatDetectionInput {
  activity: ActivityLog;
  patterns?: ThreatPattern[];
  historical?: ActivityLog[];
}

export interface ThreatDetectionOutput {
  threatDetected: boolean;
  threatLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
  indicators: string[];
  recommendedActions: string[];
}

// =============================================================================
// Supporting Types
// =============================================================================

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  returns?: Record<string, unknown>;
}

export interface LLMResponse {
  id: string;
  model: string;
  content: string;
  toolCalls?: ToolCall[];
  usage: TokenUsage;
  finishReason: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cachedTokens?: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  capabilities: string[];
}

export interface ModelConstraints {
  maxCost?: number;
  maxLatency?: number;
  requiredCapabilities?: string[];
  excludeProviders?: string[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  status: 'available' | 'degraded' | 'unavailable';
  latency: number;
  reliability: number;
}

export interface ProviderPreferences {
  preferred?: string[];
  excluded?: string[];
  costWeight?: number;
  latencyWeight?: number;
  reliabilityWeight?: number;
}

export interface FailureRecord {
  timestamp: number;
  error: string;
  provider: string;
  model: string;
}

export interface ValidationError {
  path: string;
  message: string;
  code: string;
}

export interface McpServerInfo {
  name: string;
  version: string;
  capabilities: string[];
  uri: string;
}

export interface ResourceLimits {
  maxMemoryMb?: number;
  maxCpuPercent?: number;
  maxDurationMs?: number;
  maxNetworkRequests?: number;
}

export interface AgentConfig {
  name: string;
  role: string;
  systemPrompt?: string;
  tools?: string[];
  model?: string;
  maxIterations?: number;
  timeout?: number;
}

export type AgentState =
  | 'idle'
  | 'thinking'
  | 'executing-tool'
  | 'waiting'
  | 'delegating'
  | 'completed'
  | 'error';

export interface AgentMessage {
  type: 'request' | 'response' | 'event' | 'error';
  payload: unknown;
  timestamp: number;
  correlationId?: string;
}

export interface TaskDefinition {
  id: string;
  description: string;
  priority: number;
  deadline?: number;
  dependencies?: string[];
  requiredCapabilities?: string[];
}

export interface AgentSelectionCriteria {
  capabilities?: string[];
  currentLoad?: 'low' | 'medium' | 'high';
  preferredAgents?: string[];
}

export interface HealthMetrics {
  memoryUsage: number;
  taskQueueLength: number;
  averageResponseTime: number;
  errorRate: number;
  uptime: number;
}

export interface StreamChunk {
  id: string;
  content: string;
  isFirst: boolean;
  isLast: boolean;
  tokenCount?: number;
}

export interface StreamMetrics {
  totalTokens: number;
  totalChunks: number;
  duration: number;
  averageChunkSize: number;
  throughput: number;
}

export interface SanitizationRule {
  pattern: RegExp | string;
  action: 'remove' | 'replace' | 'block';
  replacement?: string;
}

export interface SanitizationModification {
  original: string;
  modified: string;
  rule: string;
  position: number;
}

export interface OutputFilter {
  type: 'regex' | 'keyword' | 'semantic';
  pattern: string;
  action: 'redact' | 'block' | 'flag';
}

export interface Redaction {
  original: string;
  redacted: string;
  reason: string;
  start: number;
  end: number;
}

export type PiiType =
  | 'email'
  | 'phone'
  | 'ssn'
  | 'credit-card'
  | 'address'
  | 'name'
  | 'ip-address'
  | 'date-of-birth';

export interface PiiMatch {
  type: PiiType;
  value: string;
  confidence: number;
  start: number;
  end: number;
}

export type ModerationCategory =
  | 'hate'
  | 'violence'
  | 'sexual'
  | 'self-harm'
  | 'illegal'
  | 'harassment';

export interface ModerationViolation {
  category: ModerationCategory;
  severity: 'low' | 'medium' | 'high';
  snippet: string;
  explanation: string;
}

export interface ComplianceViolation {
  regulation: string;
  requirement: string;
  violation: string;
  severity: 'minor' | 'major' | 'critical';
}

export interface ActivityLog {
  timestamp: number;
  action: string;
  actor: string;
  resource?: string;
  metadata?: Record<string, unknown>;
}

export interface ThreatPattern {
  name: string;
  pattern: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  indicators: string[];
}

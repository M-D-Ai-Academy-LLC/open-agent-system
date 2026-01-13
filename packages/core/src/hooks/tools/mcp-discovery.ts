/**
 * MCP Tool Discovery Hook (#20)
 *
 * Discovers and registers tools from MCP servers.
 * Use cases: MCP integration, tool catalog, dynamic tool loading.
 */

import type {
  HookHandler,
  HookResult,
  McpToolDiscoveryInput,
  McpToolDiscoveryOutput,
  ToolDefinition,
  McpServerInfo,
} from '../../types/hooks.js';
import { HookRegistry, HOOK_NAMES } from '../registry.js';

/**
 * Default MCP discovery handler - no-op
 */
export const defaultMcpDiscoveryHandler: HookHandler<
  McpToolDiscoveryInput,
  McpToolDiscoveryOutput
> = async (input, _context): Promise<HookResult<McpToolDiscoveryOutput>> => {
  return {
    success: true,
    data: {
      tools: [],
      serverInfo: {
        name: input.serverUri,
        version: 'unknown',
        capabilities: input.capabilities ?? [],
        uri: input.serverUri,
      },
      connected: false,
    },
  };
};

/**
 * MCP connection options
 */
export interface McpConnectionOptions {
  timeout?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/**
 * MCP client interface for discovery
 */
export interface McpClient {
  connect(uri: string, options?: McpConnectionOptions): Promise<McpServerInfo>;
  listTools(): Promise<ToolDefinition[]>;
  disconnect(): Promise<void>;
}

/**
 * Creates an MCP discovery handler with a client
 */
export function createMcpDiscoveryHandler(
  createClient: () => McpClient,
  options?: {
    connectionTimeout?: number;
    toolFilter?: (tool: ToolDefinition) => boolean;
  }
): HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput> {
  const connectionTimeout = options?.connectionTimeout ?? 30000;
  const toolFilter = options?.toolFilter ?? (() => true);

  return async (input, _context): Promise<HookResult<McpToolDiscoveryOutput>> => {
    const client = createClient();

    try {
      const serverInfo = await client.connect(input.serverUri, {
        timeout: connectionTimeout,
      });

      const tools = await client.listTools();
      const filteredTools = tools.filter(toolFilter);

      await client.disconnect();

      return {
        success: true,
        data: {
          tools: filteredTools,
          serverInfo,
          connected: true,
        },
      };
    } catch (error) {
      try {
        await client.disconnect();
      } catch {
        // Ignore disconnect errors
      }

      return {
        success: true,
        data: {
          tools: [],
          serverInfo: {
            name: input.serverUri,
            version: 'unknown',
            capabilities: [],
            uri: input.serverUri,
          },
          connected: false,
        },
        metadata: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  };
}

/**
 * MCP server registry for managing multiple servers
 */
export interface McpServerRegistry {
  servers: Map<string, {
    info: McpServerInfo;
    tools: ToolDefinition[];
    lastDiscovery: number;
  }>;
  register: (info: McpServerInfo, tools: ToolDefinition[]) => void;
  unregister: (uri: string) => boolean;
  getServer: (uri: string) => McpServerInfo | undefined;
  getAllTools: () => ToolDefinition[];
  getToolsByServer: (uri: string) => ToolDefinition[];
}

/**
 * Creates an MCP server registry
 */
export function createMcpServerRegistry(): McpServerRegistry {
  const servers = new Map<string, {
    info: McpServerInfo;
    tools: ToolDefinition[];
    lastDiscovery: number;
  }>();

  return {
    servers,
    register: (info: McpServerInfo, tools: ToolDefinition[]): void => {
      servers.set(info.uri, {
        info,
        tools,
        lastDiscovery: Date.now(),
      });
    },
    unregister: (uri: string): boolean => {
      return servers.delete(uri);
    },
    getServer: (uri: string): McpServerInfo | undefined => {
      return servers.get(uri)?.info;
    },
    getAllTools: (): ToolDefinition[] => {
      const allTools: ToolDefinition[] = [];
      for (const server of servers.values()) {
        allTools.push(...server.tools);
      }
      return allTools;
    },
    getToolsByServer: (uri: string): ToolDefinition[] => {
      return servers.get(uri)?.tools ?? [];
    },
  };
}

/**
 * Creates a discovery handler with caching
 */
export function createCachedMcpDiscovery(
  innerHandler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput>,
  options?: {
    cacheTtlMs?: number;
    maxCacheSize?: number;
  }
): HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput> {
  const cacheTtl = options?.cacheTtlMs ?? 300000; // 5 minutes
  const maxCacheSize = options?.maxCacheSize ?? 100;
  const cache = new Map<string, {
    result: McpToolDiscoveryOutput;
    timestamp: number;
  }>();

  return async (input, context): Promise<HookResult<McpToolDiscoveryOutput>> => {
    const cacheKey = input.serverUri;
    const cached = cache.get(cacheKey);

    // Check cache
    if (cached && Date.now() - cached.timestamp < cacheTtl) {
      return {
        success: true,
        data: cached.result,
        metadata: { cached: true },
      };
    }

    // Fetch fresh data
    const result = await innerHandler(input, context);

    if (result.success) {
      // Evict old entries if cache is full
      if (cache.size >= maxCacheSize) {
        const oldestKey = Array.from(cache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp)[0]?.[0];
        if (oldestKey) {
          cache.delete(oldestKey);
        }
      }

      cache.set(cacheKey, {
        result: result.data,
        timestamp: Date.now(),
      });
    }

    return result;
  };
}

/**
 * Creates a discovery handler with auto-refresh
 */
export function createAutoRefreshMcpDiscovery(
  innerHandler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput>,
  registry: McpServerRegistry,
  options?: {
    refreshIntervalMs?: number;
    onRefresh?: (uri: string, tools: ToolDefinition[]) => void;
    onError?: (uri: string, error: Error) => void;
  }
): {
  handler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput>;
  startAutoRefresh: (uris: string[]) => void;
  stopAutoRefresh: () => void;
} {
  const refreshInterval = options?.refreshIntervalMs ?? 60000; // 1 minute
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshUris: string[] = [];

  const refresh = async (): Promise<void> => {
    for (const uri of refreshUris) {
      try {
        const result = await innerHandler(
          { serverUri: uri },
          {
            requestId: `refresh-${Date.now()}`,
            timestamp: Date.now(),
            metadata: {},
          }
        );

        if (result.success && result.data.connected) {
          registry.register(result.data.serverInfo, result.data.tools);
          options?.onRefresh?.(uri, result.data.tools);
        }
      } catch (error) {
        options?.onError?.(
          uri,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  };

  const handler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput> = async (
    input,
    context
  ): Promise<HookResult<McpToolDiscoveryOutput>> => {
    const result = await innerHandler(input, context);

    if (result.success && result.data.connected) {
      registry.register(result.data.serverInfo, result.data.tools);
    }

    return result;
  };

  const startAutoRefresh = (uris: string[]): void => {
    refreshUris = uris;
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(refresh, refreshInterval);
    // Initial refresh
    refresh().catch(console.error);
  };

  const stopAutoRefresh = (): void => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
    refreshUris = [];
  };

  return { handler, startAutoRefresh, stopAutoRefresh };
}

/**
 * Creates a discovery handler with capability filtering
 */
export function createCapabilityFilteredDiscovery(
  innerHandler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput>,
  requiredCapabilities: string[]
): HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput> {
  return async (input, context): Promise<HookResult<McpToolDiscoveryOutput>> => {
    const result = await innerHandler(input, context);

    if (!result.success) {
      return result;
    }

    // Check if server has required capabilities
    const serverCapabilities = result.data.serverInfo.capabilities ?? [];
    const hasRequired = requiredCapabilities.every(
      (cap) => serverCapabilities.includes(cap) || serverCapabilities.includes('*')
    );

    if (!hasRequired) {
      return {
        success: true,
        data: {
          tools: [],
          serverInfo: result.data.serverInfo,
          connected: result.data.connected,
        },
        metadata: {
          filtered: true,
          missingCapabilities: requiredCapabilities.filter(
            (cap) => !serverCapabilities.includes(cap)
          ),
        },
      };
    }

    return result;
  };
}

/**
 * Creates a multi-server discovery helper
 */
export function createMultiServerDiscovery(
  innerHandler: HookHandler<McpToolDiscoveryInput, McpToolDiscoveryOutput>
): {
  discoverAll: (
    uris: string[],
    context: { requestId: string; timestamp: number; metadata: Record<string, unknown> }
  ) => Promise<Map<string, McpToolDiscoveryOutput>>;
} {
  const discoverAll = async (
    uris: string[],
    context: { requestId: string; timestamp: number; metadata: Record<string, unknown> }
  ): Promise<Map<string, McpToolDiscoveryOutput>> => {
    const results = new Map<string, McpToolDiscoveryOutput>();

    const promises = uris.map(async (uri) => {
      try {
        const result = await innerHandler({ serverUri: uri }, context);
        if (result.success) {
          results.set(uri, result.data);
        }
      } catch (error) {
        console.error(`Failed to discover ${uri}:`, error);
      }
    });

    await Promise.all(promises);
    return results;
  };

  return { discoverAll };
}

/**
 * Register the default MCP discovery hook
 */
export function registerDefaultMcpDiscovery(registry: HookRegistry): void {
  registry.register(
    HOOK_NAMES.MCP_TOOL_DISCOVERY,
    {
      id: 'default-mcp-discovery',
      name: 'Default MCP Discovery',
      priority: 'normal',
      description: 'No-op MCP discovery handler',
    },
    defaultMcpDiscoveryHandler
  );
}

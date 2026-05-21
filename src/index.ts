#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getClient, disconnect } from "./redis-client.js";

/** 辅助：格式化为 JSON 文本 */
function jsonText(data: unknown): string {
    return JSON.stringify(data, null, 2);
}

/**
 * 将 Redis 命令转换为 client 方法名
 * 例如: "GET" -> "get", "CLIENT LIST" -> "clientList", "CONFIG GET" -> "configGet"
 */
function toMethodName(command: string): string {
    return command
        .toLowerCase()
        .split(/\s+/)
        .map((part, i) => (i === 0 ? part : part[0].toUpperCase() + part.slice(1)))
        .join("");
}

// ─── 创建 MCP 服务器 ───────────────────────────────────────────────

const server = new McpServer({
    name: "redis-mcp-server",
    version: "1.0.0"
});

// ═══════════════════════════════════════════════════════════════════
//  通用 Redis 命令执行工具
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_execute",
    "执行任意 Redis 命令。command 为 Redis 命令名（如 GET/SET/HGETALL/CLIENT LIST），args 为命令参数数组。返回 JSON 格式的执行结果。",
    {
        command: z
            .string()
            .describe(
                "Redis 命令名，不区分大小写。多单词命令用空格分隔，如 CLIENT LIST、CONFIG GET"
            ),
        args: z
            .array(z.string())
            .default([])
            .describe("命令参数数组，例如 GET 命令传 ['mykey']，SET 命令传 ['mykey', 'myvalue']")
    },
    async ({ command, args }) => {
        const r = await getClient();

        const methodName = toMethodName(command);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (r as Record<string, any>)[methodName];

        if (typeof fn !== "function") {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `未知的 Redis 命令: "${command}" (尝试方法: ${methodName})`
                    }
                ],
                isError: true
            };
        }

        try {
            const result = await fn.apply(r, args);
            const text =
                result === null || result === undefined
                    ? "(nil)"
                    : typeof result === "string"
                      ? result
                      : jsonText(result);
            return {
                content: [{ type: "text" as const, text }]
            };
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Redis 命令执行错误: ${message}`
                    }
                ],
                isError: true
            };
        }
    }
);

// ═══════════════════════════════════════════════════════════════════
//  启动服务器
// ═══════════════════════════════════════════════════════════════════

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Redis MCP Server running on stdio");
}

main().catch(err => {
    console.error("Failed to start MCP server:", err);
    // 不退出进程，保持存活以便重试连接
});

// 优雅关闭
process.on("SIGINT", async () => {
    await disconnect();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    await disconnect();
    process.exit(0);
});

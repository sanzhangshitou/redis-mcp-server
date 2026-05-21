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
    // 处理空格分隔的多单词命令: "CLIENT LIST" -> "clientList"
    const spaceParts = command.split(/\s+/);
    if (spaceParts.length > 1) {
        return spaceParts
            .map((part, i) => {
                const lower = part.toLowerCase();
                return i === 0 ? lower : lower[0].toUpperCase() + lower.slice(1);
            })
            .join("");
    }

    // 处理单单词复合命令: 按大写字母边界拆分
    //   "LPUSH" -> ["L", "PUSH"] -> "lPush"
    //   "HGETALL" -> ["H", "GET", "ALL"] -> "hGetAll"
    //   "GET" -> ["GET"] -> 无变化，走 fallback
    const camelMatches = command.match(/[A-Z][a-z0-9]*/g);
    if (camelMatches && camelMatches.length > 1) {
        return camelMatches
            .map((part, i) =>
                i === 0
                    ? part.toLowerCase()
                    : part[0] + part.slice(1).toLowerCase()
            )
            .join("");
    }

    // Fallback: 纯小写（SET, GET, DEL 等）
    return command.toLowerCase();
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

        // 先尝试直接调用 node-redis 方法
        if (typeof fn === "function") {
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
            } catch {
                // 方法存在但调用失败（如 ZADD 需要对象参数），
                // 回退到 sendCommand
            }
        }

        // 回退：使用 sendCommand 发送原始 Redis 命令
        // sendCommand 接受 [command, ...args] 数组格式
        const rawArgs = [command.toUpperCase(), ...args];
        try {
            const result = await r.sendCommand(rawArgs);
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

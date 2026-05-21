import { createClient, type RedisClientType } from "redis";

let client: RedisClientType | null = null;
let lastError: string | null = null;

/**
 * 获取 Redis 客户端单例。
 * 连接失败时抛出带描述信息的 Error（不会导致进程终止）。
 * 每次调用时若之前连接失败，会自动重试。
 */
export async function getClient(): Promise<RedisClientType> {
    if (client?.isOpen) {
        return client;
    }

    // 清理上一次失败的连接
    if (client && !client.isOpen) {
        try {
            await client.disconnect();
        } catch {
            // 忽略清理错误
        }
        client = null;
    }

    const host = process.env.REDIS_HOST || "127.0.0.1";
    const port = parseInt(process.env.REDIS_PORT || "6379", 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const db = parseInt(process.env.REDIS_DB || "0", 10);

    client = createClient({
        socket: {
            host,
            port,
            connectTimeout: 5000 // 5 秒连接超时，避免长时间挂起
        },
        password,
        database: db,
        // 不自动重连，由上层调用 getClient 时手动重试
        disableOfflineQueue: true
    });

    client.on("error", err => {
        console.error("Redis Client Error:", err.message);
    });

    try {
        await client.connect();
        lastError = null;
        console.error(`Connected to Redis at ${host}:${port} (db ${db})`);
        return client;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        lastError = `无法连接到 Redis (${host}:${port}): ${message}`;
        console.error(lastError);

        // 清理客户端，下次调用会重试
        try {
            await client.disconnect();
        } catch {
            // 忽略
        }
        client = null;

        throw new Error(lastError);
    }
}

/**
 * 获取最后一次连接错误信息（供外部查询状态）
 */
export function getLastError(): string | null {
    return lastError;
}

/**
 * 断开 Redis 连接
 */
export async function disconnect(): Promise<void> {
    if (client?.isOpen) {
        await client.quit();
        client = null;
    }
}

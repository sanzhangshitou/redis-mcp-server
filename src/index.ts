#!/usr/bin/env node
import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getClient, disconnect } from "./redis-client.js";

// ─── 辅助函数 ───────────────────────────────────────────────────────

/** 格式化为 JSON 文本 */
function jsonText(data: unknown): string {
    return JSON.stringify(data, null, 2);
}

/** 格式化 Redis 返回结果 */
function fmtResult(result: unknown): string {
    if (result === null || result === undefined) return "(nil)";
    if (typeof result === "string") return result;
    return jsonText(result);
}

/** 执行 Redis 命令的通用包装 */
async function redisCmd(cmd: string, args: string[]) {
    const r = await getClient();
    try {
        const result = await r.sendCommand([cmd, ...args]);
        return { content: [{ type: "text" as const, text: fmtResult(result) }] };
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            content: [{ type: "text" as const, text: `Redis 错误: ${message}` }],
            isError: true,
        };
    }
}

// ─── 创建 MCP 服务器 ────────────────────────────────────────────────

const server = new McpServer({
    name: "redis-mcp-server",
    version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════
//  KEY 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_del",
    "删除一个或多个 key。返回被删除的 key 数量。",
    { args: z.array(z.string()).describe("要删除的键名数组，如 ['key1', 'key2', 'key3']") },
    async ({ args }) => redisCmd("DEL", args),
);

server.tool(
    "redis_exists",
    "检查一个或多个 key 是否存在。返回存在的 key 数量。",
    { args: z.array(z.string()).describe("要检查的键名数组，如 ['key1', 'key2']") },
    async ({ args }) => redisCmd("EXISTS", args),
);

server.tool(
    "redis_expire",
    "为 key 设置过期时间（秒）。返回 1 表示成功，0 表示 key 不存在。",
    { args: z.array(z.string()).describe("['键名', '秒数']，如 ['mykey', '60']") },
    async ({ args }) => redisCmd("EXPIRE", args),
);

server.tool(
    "redis_expireat",
    "为 key 设置过期时间（Unix 时间戳，秒）。返回 1 表示成功。",
    { args: z.array(z.string()).describe("['键名', 'unix时间戳']，如 ['mykey', '1700000000']") },
    async ({ args }) => redisCmd("EXPIREAT", args),
);

server.tool(
    "redis_persist",
    "移除 key 的过期时间，使其永久保存。返回 1 表示成功。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("PERSIST", args),
);

server.tool(
    "redis_ttl",
    "获取 key 的剩余生存时间（秒）。-1 表示永久，-2 表示 key 不存在。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("TTL", args),
);

server.tool(
    "redis_pttl",
    "获取 key 的剩余生存时间（毫秒）。-1 表示永久，-2 表示 key 不存在。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("PTTL", args),
);

server.tool(
    "redis_type",
    "返回 key 存储的数据类型（string/list/set/zset/hash/stream/none）。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("TYPE", args),
);

server.tool(
    "redis_keys",
    "查找所有匹配给定模式的 key。**生产环境慎用**，数据量大时建议用 redis_scan。",
    { args: z.array(z.string()).describe("['模式']，如 ['user:*']、['*']") },
    async ({ args }) => redisCmd("KEYS", args),
);

server.tool(
    "redis_scan",
    "游标迭代遍历 key，不会阻塞服务器。返回游标和匹配的 key 列表。",
    {
        args: z
            .array(z.string())
            .describe(
                "['游标', 'MATCH', '模式', 'COUNT', '数量']，游标首次为 '0'。如 ['0', 'MATCH', 'user:*', 'COUNT', '100']",
            ),
    },
    async ({ args }) => redisCmd("SCAN", args),
);

server.tool(
    "redis_randomkey",
    "从当前数据库随机返回一个 key。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async ({ args }) => redisCmd("RANDOMKEY", args),
);

server.tool(
    "redis_rename",
    "重命名 key。如果 newkey 已存在则会先覆盖。返回 OK。",
    { args: z.array(z.string()).describe("['旧键名', '新键名']") },
    async ({ args }) => redisCmd("RENAME", args),
);

server.tool(
    "redis_renamenx",
    "仅当 newkey 不存在时重命名 key。返回 1 成功，0 表示 newkey 已存在。",
    { args: z.array(z.string()).describe("['旧键名', '新键名']") },
    async ({ args }) => redisCmd("RENAMENX", args),
);

server.tool(
    "redis_unlink",
    "非阻塞异步删除一个或多个 key。返回被删除的 key 数量。",
    { args: z.array(z.string()).describe("要删除的键名数组，如 ['key1', 'key2']") },
    async ({ args }) => redisCmd("UNLINK", args),
);

// ═══════════════════════════════════════════════════════════════════
//  STRING 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_get",
    "获取指定 key 的字符串值。key 不存在返回 (nil)。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("GET", args),
);

server.tool(
    "redis_set",
    "设置字符串键值对。可选支持 EX（秒）/PX（毫秒）过期、NX（不存在时）/XX（存在时）。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '值'] 或 ['键名', '值', 'EX', '秒数'] 或 ['键名', '值', 'PX', '毫秒数'] 或 ['键名', '值', 'NX']。如 ['mykey', 'hello']、['mykey', 'hello', 'EX', '60']",
            ),
    },
    async ({ args }) => redisCmd("SET", args),
);

server.tool(
    "redis_setnx",
    "仅当 key 不存在时设置值。返回 1 成功，0 表示 key 已存在。",
    { args: z.array(z.string()).describe("['键名', '值']") },
    async ({ args }) => redisCmd("SETNX", args),
);

server.tool(
    "redis_setex",
    "设置值并同时指定过期时间（秒）。等效于 SET key value EX seconds。",
    { args: z.array(z.string()).describe("['键名', '秒数', '值']，如 ['mykey', '60', 'hello']") },
    async ({ args }) => redisCmd("SETEX", args),
);

server.tool(
    "redis_psetex",
    "设置值并同时指定过期时间（毫秒）。",
    { args: z.array(z.string()).describe("['键名', '毫秒数', '值']，如 ['mykey', '5000', 'hello']") },
    async ({ args }) => redisCmd("PSETEX", args),
);

server.tool(
    "redis_getdel",
    "获取 key 的值并删除 key。key 不存在返回 (nil)。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("GETDEL", args),
);

server.tool(
    "redis_getex",
    "获取 key 的值并可同时设置/刷新过期时间。",
    { args: z.array(z.string()).describe("['键名', 'EX', '秒数'] 或 ['键名', 'PERSIST']") },
    async ({ args }) => redisCmd("GETEX", args),
);

server.tool(
    "redis_getrange",
    "返回 key 的字符串值的子串（按字节偏移）。",
    { args: z.array(z.string()).describe("['键名', '起始偏移', '结束偏移']，如 ['mykey', '0', '3']") },
    async ({ args }) => redisCmd("GETRANGE", args),
);

server.tool(
    "redis_setrange",
    "从指定偏移量开始覆写字符串值。返回修改后的字符串长度。",
    { args: z.array(z.string()).describe("['键名', '偏移量', '新字符串']，如 ['mykey', '5', 'world']") },
    async ({ args }) => redisCmd("SETRANGE", args),
);

server.tool(
    "redis_mget",
    "批量获取多个 key 的值。不存在的 key 返回 (nil)。",
    { args: z.array(z.string()).describe("键名数组，如 ['key1', 'key2', 'key3']") },
    async ({ args }) => redisCmd("MGET", args),
);

server.tool(
    "redis_mset",
    "批量设置多个键值对。**注意：交替传入键和值**。总是返回 OK。",
    {
        args: z
            .array(z.string())
            .describe("交替传入键值对，如 ['key1', 'val1', 'key2', 'val2', 'key3', 'val3']"),
    },
    async ({ args }) => redisCmd("MSET", args),
);

server.tool(
    "redis_msetnx",
    "仅当所有 key 都不存在时批量设置。返回 1 成功，0 表示有 key 已存在。",
    {
        args: z
            .array(z.string())
            .describe("交替传入键值对，如 ['key1', 'val1', 'key2', 'val2']"),
    },
    async ({ args }) => redisCmd("MSETNX", args),
);

server.tool(
    "redis_incr",
    "将 key 的整数值 +1。key 不存在时先初始化为 0 再 +1。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("INCR", args),
);

server.tool(
    "redis_incrby",
    "将 key 的整数值 +指定增量。key 不存在时先初始化为 0。",
    { args: z.array(z.string()).describe("['键名', '增量']，如 ['counter', '5']") },
    async ({ args }) => redisCmd("INCRBY", args),
);

server.tool(
    "redis_incrbyfloat",
    "将 key 的浮点数值 +指定增量。",
    { args: z.array(z.string()).describe("['键名', '浮点增量']，如 ['price', '1.5']") },
    async ({ args }) => redisCmd("INCRBYFLOAT", args),
);

server.tool(
    "redis_decr",
    "将 key 的整数值 -1。key 不存在时先初始化为 0 再 -1。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("DECR", args),
);

server.tool(
    "redis_decrby",
    "将 key 的整数值 -指定减量。key 不存在时先初始化为 0。",
    { args: z.array(z.string()).describe("['键名', '减量']，如 ['counter', '3']") },
    async ({ args }) => redisCmd("DECRBY", args),
);

server.tool(
    "redis_append",
    "向 key 的字符串值末尾追加字符串。返回追加后的总长度。key 不存在时先创建。",
    { args: z.array(z.string()).describe("['键名', '追加字符串']") },
    async ({ args }) => redisCmd("APPEND", args),
);

server.tool(
    "redis_strlen",
    "返回 key 的字符串值的长度。key 不存在返回 0。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("STRLEN", args),
);

// ═══════════════════════════════════════════════════════════════════
//  HASH 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_hget",
    "获取哈希表中指定字段的值。字段不存在返回 (nil)。",
    { args: z.array(z.string()).describe("['键名', '字段名']") },
    async ({ args }) => redisCmd("HGET", args),
);

server.tool(
    "redis_hset",
    "向哈希表中设置一个或多个字段值。返回新增的字段数。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '字段1', '值1'] 或 ['键名', '字段1', '值1', '字段2', '值2', ...]。如 ['user:1', 'name', 'Alice', 'age', '30']",
            ),
    },
    async ({ args }) => redisCmd("HSET", args),
);

server.tool(
    "redis_hsetnx",
    "仅当字段不存在时为哈希表的字段设置值。返回 1 成功，0 表示字段已存在。",
    { args: z.array(z.string()).describe("['键名', '字段名', '值']") },
    async ({ args }) => redisCmd("HSETNX", args),
);

server.tool(
    "redis_hgetall",
    "获取哈希表中所有字段和值。返回交替的字段-值列表。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("HGETALL", args),
);

server.tool(
    "redis_hdel",
    "删除哈希表中一个或多个字段。返回被删除的字段数。",
    { args: z.array(z.string()).describe("['键名', '字段1', '字段2', ...]") },
    async ({ args }) => redisCmd("HDEL", args),
);

server.tool(
    "redis_hexists",
    "检查哈希表中指定字段是否存在。返回 1 存在，0 不存在。",
    { args: z.array(z.string()).describe("['键名', '字段名']") },
    async ({ args }) => redisCmd("HEXISTS", args),
);

server.tool(
    "redis_hkeys",
    "获取哈希表中所有字段名。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("HKEYS", args),
);

server.tool(
    "redis_hvals",
    "获取哈希表中所有字段的值。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("HVALS", args),
);

server.tool(
    "redis_hlen",
    "获取哈希表中的字段数量。key 不存在返回 0。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("HLEN", args),
);

server.tool(
    "redis_hmget",
    "批量获取哈希表中多个字段的值。不存在的字段返回 (nil)。",
    { args: z.array(z.string()).describe("['键名', '字段1', '字段2', ...]") },
    async ({ args }) => redisCmd("HMGET", args),
);

server.tool(
    "redis_hincrby",
    "将哈希表字段的整数值 +指定增量。字段不存在时先创建。",
    { args: z.array(z.string()).describe("['键名', '字段名', '整数增量']，如 ['user:1', 'age', '1']") },
    async ({ args }) => redisCmd("HINCRBY", args),
);

server.tool(
    "redis_hincrbyfloat",
    "将哈希表字段的浮点数值 +指定增量。",
    { args: z.array(z.string()).describe("['键名', '字段名', '浮点增量']") },
    async ({ args }) => redisCmd("HINCRBYFLOAT", args),
);

server.tool(
    "redis_hstrlen",
    "返回哈希表字段值的字符串长度。",
    { args: z.array(z.string()).describe("['键名', '字段名']") },
    async ({ args }) => redisCmd("HSTRLEN", args),
);

server.tool(
    "redis_hrandfield",
    "从哈希表中随机返回一个或多个字段名。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名'] 返回 1 个字段，或 ['键名', '数量'] 返回多个，加 WITHVALUES 同时返回值。如 ['myhash', '3', 'WITHVALUES']",
            ),
    },
    async ({ args }) => redisCmd("HRANDFIELD", args),
);

// ═══════════════════════════════════════════════════════════════════
//  LIST 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_lpush",
    "将一个或多个值从列表左侧（头部）插入。返回插入后列表的长度。",
    { args: z.array(z.string()).describe("['键名', '值1', '值2', ...]") },
    async ({ args }) => redisCmd("LPUSH", args),
);

server.tool(
    "redis_rpush",
    "将一个或多个值从列表右侧（尾部）插入。返回插入后列表的长度。",
    { args: z.array(z.string()).describe("['键名', '值1', '值2', ...]") },
    async ({ args }) => redisCmd("RPUSH", args),
);

server.tool(
    "redis_lpop",
    "从列表左侧（头部）弹出并返回一个或多个元素。列表为空返回 (nil)。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 弹出一个，或 ['键名', '数量'] 弹出多个。如 ['mylist']、['mylist', '3']"),
    },
    async ({ args }) => redisCmd("LPOP", args),
);

server.tool(
    "redis_rpop",
    "从列表右侧（尾部）弹出并返回一个或多个元素。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 弹出一个，或 ['键名', '数量'] 弹出多个。如 ['mylist']、['mylist', '3']"),
    },
    async ({ args }) => redisCmd("RPOP", args),
);

server.tool(
    "redis_lrange",
    "获取列表中指定范围的元素。0 -1 表示获取全部。",
    { args: z.array(z.string()).describe("['键名', '起始索引', '结束索引']，如 ['mylist', '0', '-1']") },
    async ({ args }) => redisCmd("LRANGE", args),
);

server.tool(
    "redis_llen",
    "获取列表的长度。key 不存在返回 0。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("LLEN", args),
);

server.tool(
    "redis_lrem",
    "从列表中移除指定数量的匹配元素。count>0 从头开始，count<0 从尾开始，count=0 移除全部匹配。",
    { args: z.array(z.string()).describe("['键名', '数量', '值']，如 ['mylist', '2', 'hello']") },
    async ({ args }) => redisCmd("LREM", args),
);

server.tool(
    "redis_lindex",
    "获取列表中指定索引位置的元素。索引从 0 开始，负数表示从尾部计算。",
    { args: z.array(z.string()).describe("['键名', '索引']，如 ['mylist', '0']、['mylist', '-1']") },
    async ({ args }) => redisCmd("LINDEX", args),
);

server.tool(
    "redis_lset",
    "设置列表中指定索引位置的元素值。索引必须已存在。",
    { args: z.array(z.string()).describe("['键名', '索引', '新值']") },
    async ({ args }) => redisCmd("LSET", args),
);

server.tool(
    "redis_linsert",
    "在列表的指定元素前或后插入新值。返回插入后列表长度，未找到 pivot 返回 -1。",
    {
        args: z
            .array(z.string())
            .describe("['键名', 'BEFORE', '参考元素', '新值'] 或 ['键名', 'AFTER', '参考元素', '新值']"),
    },
    async ({ args }) => redisCmd("LINSERT", args),
);

server.tool(
    "redis_ltrim",
    "裁剪列表，只保留指定范围内的元素。",
    { args: z.array(z.string()).describe("['键名', '起始索引', '结束索引']，如 ['mylist', '0', '9']") },
    async ({ args }) => redisCmd("LTRIM", args),
);

server.tool(
    "redis_lpos",
    "查找列表中匹配元素首次出现的位置（索引）。支持 RANK 参数查找第 N 次出现。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '值'] 或 ['键名', '值', 'RANK', '次数'] 或 ['键名', '值', 'COUNT', '数量']。如 ['mylist', 'a']、['mylist', 'a', 'RANK', '2']",
            ),
    },
    async ({ args }) => redisCmd("LPOS", args),
);

// ═══════════════════════════════════════════════════════════════════
//  SET 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_sadd",
    "向集合中添加一个或多个成员。返回新添加的成员数（已存在的跳过）。",
    { args: z.array(z.string()).describe("['键名', '成员1', '成员2', ...]") },
    async ({ args }) => redisCmd("SADD", args),
);

server.tool(
    "redis_srem",
    "从集合中移除一个或多个成员。返回被移除的成员数。",
    { args: z.array(z.string()).describe("['键名', '成员1', '成员2', ...]") },
    async ({ args }) => redisCmd("SREM", args),
);

server.tool(
    "redis_smembers",
    "获取集合中的所有成员。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("SMEMBERS", args),
);

server.tool(
    "redis_sismember",
    "检查指定成员是否属于集合。返回 1 是，0 不是。",
    { args: z.array(z.string()).describe("['键名', '成员']") },
    async ({ args }) => redisCmd("SISMEMBER", args),
);

server.tool(
    "redis_smismember",
    "批量检查多个成员是否属于集合。返回数组，每个成员一个 1/0。",
    { args: z.array(z.string()).describe("['键名', '成员1', '成员2', ...]") },
    async ({ args }) => redisCmd("SMISMEMBER", args),
);

server.tool(
    "redis_scard",
    "获取集合的成员数量。key 不存在返回 0。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("SCARD", args),
);

server.tool(
    "redis_srandmember",
    "从集合中随机获取一个或多个不重复的成员。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 返回 1 个，或 ['键名', '数量'] 返回多个。负数可返回重复的。如 ['myset', '3']"),
    },
    async ({ args }) => redisCmd("SRANDMEMBER", args),
);

server.tool(
    "redis_spop",
    "从集合中随机弹出并移除一个或多个成员。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 弹出一个，或 ['键名', '数量'] 弹出多个。如 ['myset', '2']"),
    },
    async ({ args }) => redisCmd("SPOP", args),
);

server.tool(
    "redis_smove",
    "将成员从源集合移动到目标集合。源集合必须有该成员。返回 1 成功。",
    { args: z.array(z.string()).describe("['源键名', '目标键名', '成员']") },
    async ({ args }) => redisCmd("SMOVE", args),
);

server.tool(
    "redis_sunion",
    "获取多个集合的并集（所有不重复成员）。",
    { args: z.array(z.string()).describe("集合键名数组，如 ['set1', 'set2', 'set3']") },
    async ({ args }) => redisCmd("SUNION", args),
);

server.tool(
    "redis_sinter",
    "获取多个集合的交集（共同成员）。",
    { args: z.array(z.string()).describe("集合键名数组，如 ['set1', 'set2', 'set3']") },
    async ({ args }) => redisCmd("SINTER", args),
);

server.tool(
    "redis_sdiff",
    "获取多个集合的差集（第一个集合独有，减去后面所有）。",
    { args: z.array(z.string()).describe("集合键名数组，如 ['set1', 'set2', 'set3']") },
    async ({ args }) => redisCmd("SDIFF", args),
);

server.tool(
    "redis_sunionstore",
    "将多个集合的并集保存到目标集合中。返回结果集的成员数。",
    { args: z.array(z.string()).describe("['目标键名', '集合1', '集合2', ...]") },
    async ({ args }) => redisCmd("SUNIONSTORE", args),
);

server.tool(
    "redis_sinterstore",
    "将多个集合的交集保存到目标集合中。返回结果集的成员数。",
    { args: z.array(z.string()).describe("['目标键名', '集合1', '集合2', ...]") },
    async ({ args }) => redisCmd("SINTERSTORE", args),
);

server.tool(
    "redis_sdiffstore",
    "将多个集合的差集保存到目标集合中。返回结果集的成员数。",
    { args: z.array(z.string()).describe("['目标键名', '集合1', '集合2', ...]") },
    async ({ args }) => redisCmd("SDIFFSTORE", args),
);

server.tool(
    "redis_sscan",
    "游标迭代遍历集合中的成员，不会阻塞服务器。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '游标', 'MATCH', '模式', 'COUNT', '数量']，游标首次为 '0'。如 ['myset', '0', 'COUNT', '100']",
            ),
    },
    async ({ args }) => redisCmd("SSCAN", args),
);

// ═══════════════════════════════════════════════════════════════════
//  SORTED SET 操作
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_zadd",
    "向有序集合中添加一个或多个成员及其分数。**注意：交替传入分数和成员**。返回新添加的成员数。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '分数1', '成员1'] 或 ['键名', '分数1', '成员1', '分数2', '成员2', ...]。如 ['leaderboard', '100', 'Alice', '200', 'Bob']",
            ),
    },
    async ({ args }) => redisCmd("ZADD", args),
);

server.tool(
    "redis_zrem",
    "从有序集合中移除一个或多个成员。返回被移除的成员数。",
    { args: z.array(z.string()).describe("['键名', '成员1', '成员2', ...]") },
    async ({ args }) => redisCmd("ZREM", args),
);

server.tool(
    "redis_zscore",
    "获取有序集合中成员的分数。成员不存在返回 (nil)。",
    { args: z.array(z.string()).describe("['键名', '成员']") },
    async ({ args }) => redisCmd("ZSCORE", args),
);

server.tool(
    "redis_zrank",
    "获取有序集合中成员按分数升序的排名（从 0 开始）。",
    { args: z.array(z.string()).describe("['键名', '成员']") },
    async ({ args }) => redisCmd("ZRANK", args),
);

server.tool(
    "redis_zrevrank",
    "获取有序集合中成员按分数降序的排名（从 0 开始）。",
    { args: z.array(z.string()).describe("['键名', '成员']") },
    async ({ args }) => redisCmd("ZREVRANK", args),
);

server.tool(
    "redis_zcard",
    "获取有序集合的成员数量。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("ZCARD", args),
);

server.tool(
    "redis_zcount",
    "统计有序集合中分数在指定区间内的成员数量。",
    {
        args: z
            .array(z.string())
            .describe("['键名', '最小分', '最大分']，如 ['zset', '0', '100']。用 ( 表示开区间：['zset', '(0', '100']"),
    },
    async ({ args }) => redisCmd("ZCOUNT", args),
);

server.tool(
    "redis_zincrby",
    "将有序集合中成员的分数 +指定增量。返回增加后的新分数。",
    { args: z.array(z.string()).describe("['键名', '增量', '成员']，如 ['zset', '5.5', 'Alice']") },
    async ({ args }) => redisCmd("ZINCRBY", args),
);

server.tool(
    "redis_zrange",
    "按分数升序获取有序集合中指定排名范围的成员。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '起始', '结束', 'WITHSCORES'] 含分数，或 ['键名', '起始', '结束'] 不含分数。如 ['zset', '0', '-1', 'WITHSCORES'] 获取全部含分。",
            ),
    },
    async ({ args }) => redisCmd("ZRANGE", args),
);

server.tool(
    "redis_zrevrange",
    "按分数降序获取有序集合中指定排名范围的成员。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '起始', '结束', 'WITHSCORES'] 含分数。如 ['zset', '0', '-1', 'WITHSCORES'] 获取全部含分（降序）。",
            ),
    },
    async ({ args }) => redisCmd("ZREVRANGE", args),
);

server.tool(
    "redis_zrangebyscore",
    "按分数区间升序获取有序集合的成员。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '最小分', '最大分', 'WITHSCORES'] 或再加 'LIMIT', '偏移', '数量'。如 ['zset', '0', '100', 'WITHSCORES']",
            ),
    },
    async ({ args }) => redisCmd("ZRANGEBYSCORE", args),
);

server.tool(
    "redis_zrevrangebyscore",
    "按分数区间降序获取有序集合的成员。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '最大分', '最小分', 'WITHSCORES'] 或再加 'LIMIT', '偏移', '数量'。如 ['zset', '100', '0', 'WITHSCORES']",
            ),
    },
    async ({ args }) => redisCmd("ZREVRANGEBYSCORE", args),
);

server.tool(
    "redis_zremrangebyrank",
    "按排名范围删除有序集合中的成员。返回被删除的成员数。",
    { args: z.array(z.string()).describe("['键名', '起始', '结束']，如 ['zset', '0', '9']") },
    async ({ args }) => redisCmd("ZREMRANGEBYRANK", args),
);

server.tool(
    "redis_zremrangebyscore",
    "按分数区间删除有序集合中的成员。返回被删除的成员数。",
    { args: z.array(z.string()).describe("['键名', '最小分', '最大分']，如 ['zset', '0', '50']") },
    async ({ args }) => redisCmd("ZREMRANGEBYSCORE", args),
);

server.tool(
    "redis_zpopmin",
    "从有序集合中弹出分数最小的一个或多个成员。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 弹出一个，或 ['键名', '数量'] 弹出多个。如 ['zset', '3']"),
    },
    async ({ args }) => redisCmd("ZPOPMIN", args),
);

server.tool(
    "redis_zpopmax",
    "从有序集合中弹出分数最大的一个或多个成员。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 弹出一个，或 ['键名', '数量'] 弹出多个。如 ['zset', '3']"),
    },
    async ({ args }) => redisCmd("ZPOPMAX", args),
);

server.tool(
    "redis_zrandmember",
    "从有序集合中随机返回一个或多个成员。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名'] 返回 1 个，或 ['键名', '数量'] 返回多个，加 WITHSCORES 同时返回分数。如 ['zset', '3', 'WITHSCORES']",
            ),
    },
    async ({ args }) => redisCmd("ZRANDMEMBER", args),
);

server.tool(
    "redis_zscan",
    "游标迭代遍历有序集合中的成员和分数。",
    {
        args: z
            .array(z.string())
            .describe("['键名', '游标', 'MATCH', '模式', 'COUNT', '数量']，游标首次为 '0'"),
    },
    async ({ args }) => redisCmd("ZSCAN", args),
);

// ═══════════════════════════════════════════════════════════════════
//  PUB/SUB
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_publish",
    "向频道发布一条消息。返回收到消息的订阅者数量。",
    { args: z.array(z.string()).describe("['频道名', '消息内容']，如 ['news', 'hello world']") },
    async ({ args }) => redisCmd("PUBLISH", args),
);

server.tool(
    "redis_pubsub_channels",
    "列出当前活跃的频道（匹配模式可选）。",
    {
        args: z
            .array(z.string())
            .default([])
            .describe("无参数传空数组 []，或 ['模式'] 如 ['news:*']"),
    },
    async ({ args }) => redisCmd("PUBSUB", ["CHANNELS", ...args]),
);

server.tool(
    "redis_pubsub_numsub",
    "查看指定频道的订阅者数量。",
    { args: z.array(z.string()).describe("频道名数组，如 ['chan1', 'chan2']") },
    async ({ args }) => redisCmd("PUBSUB", ["NUMSUB", ...args]),
);

// ═══════════════════════════════════════════════════════════════════
//  SERVER INFO / 运维
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_ping",
    "测试与 Redis 服务器的连通性。正常返回 PONG，带参数则返回该参数。",
    { args: z.array(z.string()).default([]).describe("无参数传空数组 []，或 ['消息']") },
    async ({ args }) => redisCmd("PING", args),
);

server.tool(
    "redis_info",
    "获取 Redis 服务器信息和统计数据。",
    {
        args: z
            .array(z.string())
            .default([])
            .describe(
                "无参数传空数组 [] 获取全部信息，或 ['分类'] 如 ['memory']、['cpu']、['stats']、['replication']、['clients']、['keyspace']、['server']",
            ),
    },
    async ({ args }) => redisCmd("INFO", args),
);

server.tool(
    "redis_dbsize",
    "返回当前数据库中 key 的数量。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async ({ args }) => redisCmd("DBSIZE", args),
);

server.tool(
    "redis_time",
    "返回 Redis 服务器的当前时间（Unix 时间戳 + 微秒）。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async ({ args }) => redisCmd("TIME", args),
);

server.tool(
    "redis_echo",
    "回显给定的字符串消息。",
    { args: z.array(z.string()).describe("['消息内容']") },
    async ({ args }) => redisCmd("ECHO", args),
);

server.tool(
    "redis_client_list",
    "获取所有客户端连接信息列表。",
    {
        args: z
            .array(z.string())
            .default([])
            .describe("无参数传空数组 []，或 ['TYPE', 'NORMAL'] 过滤连接类型"),
    },
    async ({ args }) => redisCmd("CLIENT", ["LIST", ...args]),
);

server.tool(
    "redis_client_getname",
    "获取当前连接的名称。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("CLIENT", ["GETNAME"]),
);

server.tool(
    "redis_client_setname",
    "为当前连接设置名称。",
    { args: z.array(z.string()).describe("['连接名称']，如 ['myapp-worker-1']") },
    async ({ args }) => redisCmd("CLIENT", ["SETNAME", ...args]),
);

server.tool(
    "redis_client_id",
    "获取当前连接的唯一 ID。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("CLIENT", ["ID"]),
);

server.tool(
    "redis_client_kill",
    "关闭指定的客户端连接。",
    {
        args: z
            .array(z.string())
            .describe(
                "['addr:port'] 如 ['127.0.0.1:12345']，或 ['ID', '客户端ID']，或 ['TYPE', 'NORMAL']",
            ),
    },
    async ({ args }) => redisCmd("CLIENT", ["KILL", ...args]),
);

server.tool(
    "redis_memory_usage",
    "估算指定 key 的内存占用（字节）。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 或 ['键名', 'SAMPLES', '数量'] 用于嵌套结构采样"),
    },
    async ({ args }) => redisCmd("MEMORY", ["USAGE", ...args]),
);

server.tool(
    "redis_memory_stats",
    "获取 Redis 内存使用统计信息。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("MEMORY", ["STATS"]),
);

server.tool(
    "redis_slowlog_get",
    "获取慢查询日志。",
    {
        args: z
            .array(z.string())
            .default([])
            .describe("无参数传空数组 [] 获取全部，或 ['数量'] 如 ['10'] 获取最近 10 条"),
    },
    async ({ args }) => redisCmd("SLOWLOG", ["GET", ...args]),
);

server.tool(
    "redis_slowlog_len",
    "获取慢查询日志的条数。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("SLOWLOG", ["LEN"]),
);

server.tool(
    "redis_slowlog_reset",
    "清空慢查询日志。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("SLOWLOG", ["RESET"]),
);

// ═══════════════════════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_config_get",
    "获取 Redis 配置参数的值。支持通配符 *。",
    { args: z.array(z.string()).describe("['参数名'] 或 ['模式']，如 ['maxmemory']、['*max*']") },
    async ({ args }) => redisCmd("CONFIG", ["GET", ...args]),
);

server.tool(
    "redis_config_set",
    "动态修改 Redis 配置参数（不需要重启）。",
    { args: z.array(z.string()).describe("['参数名', '值']，如 ['maxmemory', '1gb']") },
    async ({ args }) => redisCmd("CONFIG", ["SET", ...args]),
);

// ═══════════════════════════════════════════════════════════════════
//  CLUSTER
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_cluster_info",
    "获取集群状态信息。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("CLUSTER", ["INFO"]),
);

server.tool(
    "redis_cluster_nodes",
    "获取集群所有节点信息列表。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("CLUSTER", ["NODES"]),
);

server.tool(
    "redis_cluster_slots",
    "获取集群槽位分布信息。",
    { args: z.array(z.string()).default([]).describe("无参数，传空数组 []") },
    async () => redisCmd("CLUSTER", ["SLOTS"]),
);

server.tool(
    "redis_cluster_keyslot",
    "计算指定 key 所属的哈希槽。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("CLUSTER", ["KEYSLOT", ...args]),
);

// ═══════════════════════════════════════════════════════════════════
//  GEO
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_geoadd",
    "向地理空间索引中添加一个或多个位置点（经度、纬度、名称）。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '经度1', '纬度1', '名称1', '经度2', '纬度2', '名称2', ...]。如 ['cities', '13.361389', '38.115556', 'Palermo']",
            ),
    },
    async ({ args }) => redisCmd("GEOADD", args),
);

server.tool(
    "redis_geopos",
    "获取地理位置集合中一个或多个位置的坐标。",
    { args: z.array(z.string()).describe("['键名', '名称1', '名称2', ...]") },
    async ({ args }) => redisCmd("GEOPOS", args),
);

server.tool(
    "redis_geodist",
    "计算两个位置之间的距离。默认返回米。",
    {
        args: z
            .array(z.string())
            .describe("['键名', '名称1', '名称2', '单位']，单位可选 m/km/ft/mi。如 ['cities', 'a', 'b', 'km']"),
    },
    async ({ args }) => redisCmd("GEODIST", args),
);

server.tool(
    "redis_georadius",
    "以指定经纬度为中心，查询半径范围内的位置。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '经度', '纬度', '半径', '单位', 'WITHDIST'] 等。如 ['cities', '15', '37', '200', 'km', 'WITHDIST', 'COUNT', '10']",
            ),
    },
    async ({ args }) => redisCmd("GEORADIUS", args),
);

server.tool(
    "redis_georadiusbymember",
    "以某成员为中心，查询半径范围内的位置。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '成员名', '半径', '单位', 'WITHDIST']。如 ['cities', 'Palermo', '200', 'km']",
            ),
    },
    async ({ args }) => redisCmd("GEORADIUSBYMEMBER", args),
);

server.tool(
    "redis_geohash",
    "获取一个或多个位置的 Geohash 编码。",
    { args: z.array(z.string()).describe("['键名', '名称1', '名称2', ...]") },
    async ({ args }) => redisCmd("GEOHASH", args),
);

// ═══════════════════════════════════════════════════════════════════
//  HYPERLOGLOG
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_pfadd",
    "向 HyperLogLog 中添加一个或多个元素。返回 1 表示基数估算有变化。",
    { args: z.array(z.string()).describe("['键名', '元素1', '元素2', ...]") },
    async ({ args }) => redisCmd("PFADD", args),
);

server.tool(
    "redis_pfcount",
    "获取 HyperLogLog 的基数估算值（近似去重计数）。支持多个 key 的并集估算。",
    { args: z.array(z.string()).describe("键名数组，如 ['hll1', 'hll2']") },
    async ({ args }) => redisCmd("PFCOUNT", args),
);

server.tool(
    "redis_pfmerge",
    "将多个 HyperLogLog 合并到目标 key。",
    { args: z.array(z.string()).describe("['目标键名', '源键名1', '源键名2', ...]") },
    async ({ args }) => redisCmd("PFMERGE", args),
);

// ═══════════════════════════════════════════════════════════════════
//  BITMAP
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_setbit",
    "设置字符串 key 的指定偏移量上的位值（0 或 1）。返回原来的位值。",
    { args: z.array(z.string()).describe("['键名', '偏移量', '值']，如 ['bitmap', '7', '1']") },
    async ({ args }) => redisCmd("SETBIT", args),
);

server.tool(
    "redis_getbit",
    "获取字符串 key 的指定偏移量上的位值（0 或 1）。",
    { args: z.array(z.string()).describe("['键名', '偏移量']，如 ['bitmap', '7']") },
    async ({ args }) => redisCmd("GETBIT", args),
);

server.tool(
    "redis_bitcount",
    "统计字符串 key 中值为 1 的位数。可选指定字节范围。",
    {
        args: z
            .array(z.string())
            .describe("['键名'] 或 ['键名', '起始字节', '结束字节']，如 ['bitmap', '0', '10']"),
    },
    async ({ args }) => redisCmd("BITCOUNT", args),
);

server.tool(
    "redis_bitpos",
    "查找字符串 key 中第一个 0 或 1 的位置。",
    {
        args: z
            .array(z.string())
            .describe("['键名', '位值(0/1)'] 或 ['键名', '位值', '起始字节', '结束字节']"),
    },
    async ({ args }) => redisCmd("BITPOS", args),
);

server.tool(
    "redis_bitop",
    "对多个 key 执行位运算（AND/OR/XOR/NOT），结果存入目标 key。返回目标字符串的长度。",
    { args: z.array(z.string()).describe("['操作', '目标键名', '源键名1', '源键名2', ...]。操作: AND/OR/XOR/NOT") },
    async ({ args }) => redisCmd("BITOP", args),
);

server.tool(
    "redis_bitfield",
    "对字符串 key 执行位域操作（GET/SET/INCRBY）。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', 'GET', '类型', '偏移'] 或 ['键名', 'SET', '类型', '偏移', '值'] 或 ['键名', 'INCRBY', '类型', '偏移', '增量']。如 ['mykey', 'GET', 'u8', '0']",
            ),
    },
    async ({ args }) => redisCmd("BITFIELD", args),
);

// ═══════════════════════════════════════════════════════════════════
//  STREAM
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_xadd",
    "向流中添加一条消息。* 表示自动生成 ID。返回消息 ID。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', 'ID', '字段1', '值1', '字段2', '值2', ...]。ID 可用 '*' 自动生成。如 ['mystream', '*', 'sensor', 'temp', 'value', '23']。可选 MAXLEN 限制长度：['mystream', 'MAXLEN', '~', '1000', '*', 'key', 'val']",
            ),
    },
    async ({ args }) => redisCmd("XADD", args),
);

server.tool(
    "redis_xrange",
    "按 ID 范围升序获取流中的消息。- + 表示全部。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '起始ID', '结束ID'] 或 ['键名', '起始ID', '结束ID', 'COUNT', '数量']。如 ['stream', '-', '+', 'COUNT', '10']",
            ),
    },
    async ({ args }) => redisCmd("XRANGE", args),
);

server.tool(
    "redis_xrevrange",
    "按 ID 范围降序获取流中的消息。+ - 表示全部（反向）。",
    { args: z.array(z.string()).describe("['键名', '结束ID', '起始ID', 'COUNT', '数量']，如 ['stream', '+', '-', 'COUNT', '10']") },
    async ({ args }) => redisCmd("XREVRANGE", args),
);

server.tool(
    "redis_xlen",
    "获取流的长度（消息数量）。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("XLEN", args),
);

server.tool(
    "redis_xread",
    "从多个流中读取消息（非消费组模式）。支持 BLOCK 阻塞。",
    {
        args: z
            .array(z.string())
            .describe(
                "['COUNT', '数量', 'STREAMS', '键名1', '键名2', 'ID1', 'ID2']。ID 用 '0' 从头读，'$' 只读新消息。如 ['BLOCK', '1000', 'STREAMS', 'stream1', 'stream2', '0', '0']",
            ),
    },
    async ({ args }) => redisCmd("XREAD", args),
);

server.tool(
    "redis_xdel",
    "从流中删除指定消息。返回删除的消息数。",
    { args: z.array(z.string()).describe("['键名', '消息ID1', '消息ID2', ...]") },
    async ({ args }) => redisCmd("XDEL", args),
);

server.tool(
    "redis_xtrim",
    "裁剪流，只保留指定数量的消息。返回被删除的消息数。",
    {
        args: z
            .array(z.string())
            .describe("['键名', 'MAXLEN', '数量'] 或 ['键名', 'MAXLEN', '~', '数量']（~ 近似裁剪，不精确但更高效）"),
    },
    async ({ args }) => redisCmd("XTRIM", args),
);

server.tool(
    "redis_xgroup_create",
    "为流创建消费组。",
    {
        args: z
            .array(z.string())
            .describe(
                "['键名', '消费组名', '起始ID']。ID 用 '$' 只读新消息，'0' 从头读。如 ['stream', 'mygroup', '$', 'MKSTREAM']（MKSTREAM 自动创建流）",
            ),
    },
    async ({ args }) => redisCmd("XGROUP", ["CREATE", ...args]),
);

server.tool(
    "redis_xgroup_destroy",
    "删除流上的消费组。",
    { args: z.array(z.string()).describe("['键名', '消费组名']") },
    async ({ args }) => redisCmd("XGROUP", ["DESTROY", ...args]),
);

server.tool(
    "redis_xinfo_stream",
    "获取流的详细信息（长度、基数、第一个/最后一个条目等）。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("XINFO", ["STREAM", ...args]),
);

server.tool(
    "redis_xinfo_groups",
    "获取流上所有消费组的信息。",
    { args: z.array(z.string()).describe("['键名']") },
    async ({ args }) => redisCmd("XINFO", ["GROUPS", ...args]),
);

// ═══════════════════════════════════════════════════════════════════
//  DB 管理
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_select",
    "切换到指定的数据库。默认数据库是 0。",
    { args: z.array(z.string()).describe("['数据库编号']，如 ['1']") },
    async ({ args }) => redisCmd("SELECT", args),
);

server.tool(
    "redis_flushdb",
    "清空当前数据库中的所有 key。**危险操作，不可撤销！**",
    {
        args: z
            .array(z.string())
            .default([])
            .describe("无参数传空数组 []，或 ['ASYNC'] 异步清空（不阻塞）"),
    },
    async ({ args }) => redisCmd("FLUSHDB", args),
);

server.tool(
    "redis_flushall",
    "清空所有数据库中的所有 key。**极度危险操作，不可撤销！**",
    {
        args: z
            .array(z.string())
            .default([])
            .describe("无参数传空数组 []，或 ['ASYNC'] 异步清空（不阻塞）"),
    },
    async ({ args }) => redisCmd("FLUSHALL", args),
);

// ═══════════════════════════════════════════════════════════════════
//  通用命令执行（兜底，覆盖以上未列出的 Redis 命令）
// ═══════════════════════════════════════════════════════════════════

server.tool(
    "redis_execute",
    "【通用兜底】执行以上专用工具未覆盖的任意 Redis 命令。多单词命令用空格分隔。",
    {
        command: z
            .string()
            .describe(
                "Redis 命令名，不区分大小写。多单词命令用空格分隔（如 CLIENT LIST、CONFIG GET）。" +
                "以上未覆盖的命令包括：" +
                "SORT OBJECT COPY MIGRATE WAIT TOUCH DUMP RESTORE GETSET LCS LPUSHX RPUSHX BLPOP BRPOP BRPOPLPUSH RPOPLPUSH LMOVE BLMOVE LPOS " +
                "SMOVE SUNION SUNIONSTORE SINTER SINTERSTORE SINTERCARD SDIFF SDIFFSTORE SSCAN SMISMEMBER " +
                "ZUNION ZUNIONSTORE ZINTER ZINTERSTORE ZINTERCARD ZDIFF ZDIFFSTORE BZPOPMIN BZPOPMAX ZMPOP BZMPOP ZLEXCOUNT ZSCAN ZRANGEBYLEX ZREMRANGEBYLEX " +
                "HSETNX HSCAN HRANDFIELD HINCRBY HINCRBYFLOAT HSTRLEN " +
                "SUBSCRIBE UNSUBSCRIBE PSUBSCRIBE PUNSUBSCRIBE PUBSUB SPUBLISH SSUBSCRIBE " +
                "MULTI EXEC DISCARD WATCH UNWATCH " +
                "EVAL EVALSHA SCRIPT LOAD SCRIPT EXISTS SCRIPT FLUSH SCRIPT KILL FUNCTION LOAD FUNCTION LIST FUNCTION DELETE FUNCTION FLUSH FUNCTION KILL FUNCTION DUMP FUNCTION RESTORE FUNCTION STATS " +
                "BITFIELD BITOP " +
                "XREADGROUP XACK XPENDING XCLAIM XAUTOCLAIM XGROUP CREATECONSUMER XGROUP DELCONSUMER XGROUP SETID XINFO CONSUMERS " +
                "GEOSEARCH GEOSEARCHSTORE " +
                "FT.CREATE FT.SEARCH FT.AGGREGATE FT.DROPINDEX FT.INFO FT.ALTER FT.TAGVALS FT.SYNDUMP FT.SYNUPDATE FT.SPELLCHECK FT.DICTADD FT.DICTDEL FT.DICTDUMP FT.PROFILE FT.EXPLAIN FT.EXPLAINCLI FT.CONFIG " +
                "TS.CREATE TS.ADD TS.MADD TS.GET TS.MGET TS.RANGE TS.MRANGE TS.INCRBY TS.DECRBY TS.DEL TS.CREATERULE TS.DELETERULE TS.INFO TS.QUERYINDEX TS.ALTER " +
                "JSON.SET JSON.GET JSON.DEL JSON.TYPE JSON.ARRLEN JSON.ARRAPPEND JSON.ARRINSERT JSON.ARRPOP JSON.ARRTRIM JSON.NUMINCRBY JSON.NUMMULTBY JSON.STRAPPEND JSON.STRLEN JSON.OBJLEN JSON.OBJKEYS JSON.TOGGLE JSON.CLEAR JSON.MGET JSON.MSET JSON.DEBUG JSON.RESP JSON.FORGET JSON.MERGE " +
                "BF.ADD BF.MADD BF.EXISTS BF.MEXISTS BF.RESERVE BF.INFO BF.INSERT BF.SCANDUMP BF.LOADCHUNK CF.ADD CF.MADD CF.EXISTS CF.MEXISTS CF.DEL CF.COUNT CF.RESERVE CF.INFO CF.INSERT CF.INSERTNX CF.SCANDUMP CF.LOADCHUNK CMS.INITBYDIM CMS.INITBYPROB CMS.INCRBY CMS.QUERY CMS.MERGE CMS.INFO TDIGEST.CREATE TDIGEST.ADD TDIGEST.MERGE TDIGEST.CDF TDIGEST.QUANTILE TDIGEST.MIN TDIGEST.MAX TDIGEST.RESET TDIGEST.INFO TOPK.RESERVE TOPK.ADD TOPK.INCRBY TOPK.QUERY TOPK.COUNT TOPK.LIST TOPK.INFO " +
                "AUTH ACL CAT ACL DELUSER ACL GENPASS ACL GETUSER ACL LIST ACL LOAD ACL LOG ACL SAVE ACL SETUSER ACL USERS ACL WHOAMI " +
                "MONITOR CLIENT PAUSE CLIENT UNPAUSE CLIENT NO-EVICT CLIENT REPLY CLIENT TRACKING CLIENT UNBLOCK " +
                "LATENCY LATEST LATENCY HISTORY LATENCY RESET LATENCY DOCTOR LATENCY GRAPH MEMORY DOCTOR MEMORY PURGE MEMORY MALLOC-STATS COMMAND COMMAND COUNT COMMAND INFO COMMAND GETKEYS ROLE LASTSAVE " +
                "SAVE BGSAVE BGREWRITEAOF SHUTDOWN CONFIG REWRITE CONFIG RESETSTAT " +
                "REPLICAOF SLAVEOF PSYNC SYNC FAILOVER " +
                "CLUSTER REPLICAS CLUSTER COUNTKEYSINSLOT CLUSTER GETKEYSINSLOT CLUSTER MEET CLUSTER FORGET CLUSTER REPLICATE CLUSTER FAILOVER CLUSTER RESET CLUSTER SETSLOT CLUSTER ADDSLOTS CLUSTER DELSLOTS CLUSTER BUMPEPOCH CLUSTER SAVECONFIG CLUSTER LINKS CLUSTER FLUSHSLOTS READONLY READWRITE ASKING " +
                "SWAPDB"
            ),
        args: z
            .array(z.string())
            .default([])
            .describe("命令参数数组。如 GET: ['mykey']，SET: ['mykey', 'value']，ZADD: ['zset', '10', 'alice']"),
    },
    async ({ command, args }) => {
        const rawArgs = [...command.toUpperCase().split(/\s+/), ...args];
        return redisCmd(rawArgs[0], rawArgs.slice(1));
    },
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

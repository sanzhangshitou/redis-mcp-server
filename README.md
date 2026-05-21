# Redis MCP Server

> Redis MCP 服务器 — 通过 Model Context Protocol 为 AI 助手提供任意 Redis 数据库操作能力。

[![npm version](https://img.shields.io/npm/v/@sanzhangshitou/redis-mcp-server)](https://www.npmjs.com/package/@sanzhangshitou/redis-mcp-server)
[![license](https://img.shields.io/npm/l/@sanzhangshitou/redis-mcp-server)](LICENSE)
[![node](https://img.shields.io/node/v/@sanzhangshitou/redis-mcp-server)](package.json)

## 特性

- **通用命令执行** — 单个 `redis_execute` 工具支持所有 Redis 命令，无需预定义
- **自动重连** — Redis 不可用时进程不退出，恢复后自动重连
- **连接超时** — 5 秒超时保护，避免永久挂起
- **安全设计** — 危险操作（FLUSHDB 等）需显式确认，结果清晰展示

## 前置条件

- [Node.js](https://nodejs.org/) >= 22
- Redis 实例（本地或远程）

## 快速开始

```bash
# 克隆项目
git clone https://github.com/sanzhangshitou/redis-mcp-server.git
cd redis-mcp-server

# 安装依赖 & 构建
npm install
npm run build

# 开发模式（热更新）
npm run dev
```

## 配置

复制 `.env.example` 为 `.env`，按需修改 Redis 连接参数：

```env
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

## MCP 客户端接入

### Claude Desktop

在 `claude_desktop_config.json` 中添加：

```json
{
  "mcpServers": {
    "redis": {
      "command": "node",
      "args": ["path/to/redis-mcp-server/dist/index.js"],
      "env": {
        "REDIS_HOST": "127.0.0.1",
        "REDIS_PORT": "6379",
        "REDIS_PASSWORD": "",
        "REDIS_DB": "0"
      }
    }
  }
}
```

### 其他 MCP 客户端

```json
{
  "mcpServers": {
    "redis": {
      "command": "npx",
      "args": ["@sanzhangshitou/redis-mcp-server"],
      "env": {
        "REDIS_HOST": "127.0.0.1",
        "REDIS_PORT": "6379"
      }
    }
  }
}
```

## 工具说明

### `redis_execute`

执行任意 Redis 命令。不区分大小写，多单词命令用空格分隔。

| 参数 | 类型 | 必填 | 描述 |
|------|------|------|------|
| `command` | string | 是 | Redis 命令名，如 `GET`、`SET`、`HGETALL`、`CLIENT LIST` |
| `args` | string[] | 否 | 命令参数数组，默认 `[]` |

### 使用示例

```
→ redis_execute { command: "PING" }
← "PONG"

→ redis_execute { command: "SET", args: ["user:1", "John"] }
← "OK"

→ redis_execute { command: "GET", args: ["user:1"] }
← "John"

→ redis_execute { command: "HSET", args: ["user:2", "name", "Alice", "age", "30"] }
← 2

→ redis_execute { command: "HGETALL", args: ["user:2"] }
← { "name": "Alice", "age": "30" }

→ redis_execute { command: "KEYS", args: ["user:*"] }
← ["user:1", "user:2"]

→ redis_execute { command: "ZADD", args: ["rank", "100", "Alice", "200", "Bob"] }
← 2

→ redis_execute { command: "CLIENT LIST" }
← [{ "id": 1, "addr": "127.0.0.1:54321", ... }]
```

### 错误处理

Redis 不可用时工具调用不会崩溃，返回友好错误信息：

```
→ redis_execute { command: "PING" }
← Redis 命令执行错误: 无法连接到 Redis (127.0.0.1:6379): Connection refused

# Redis 恢复后自动重连
→ redis_execute { command: "PING" }
← "PONG"
```

## 开发

```bash
npm run dev          # tsx 热更新运行
npm run build        # TypeScript 编译
npm start            # 运行编译产物
npm run lint         # ESLint 检查
npm run lint:fix     # ESLint 自动修复
npm run format       # Prettier 格式化
npm run format:check # Prettier 格式检查
npm run check        # lint + format:check
```

## 技术栈

| 组件 | 版本 |
|------|------|
| [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) | ^1.29 |
| [redis](https://github.com/redis/node-redis) | ^5.12 |
| [zod](https://zod.dev/) | ^4.4 |
| [TypeScript](https://www.typescriptlang.org/) | ^5.7 |
| [dotenv](https://github.com/motdotla/dotenv) | ^17.4 |

## License

[MIT](LICENSE)

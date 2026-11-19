# gufo-gateway

ai07 gufo（MiniMax H3）前面的排队网关。它把 gufo 的异步视频接口包装成 OpenAI 兼容的 `/v1/videos`，给 LobeHub 一个稳定的 provider 端点。

## 为什么需要它

- gufo 只有 **1 个执行 + 1 个排队**，第 3 个请求返回 429；多人使用时必须排队。
- LobeHub 的 OpenAI 兼容视频实现只认 `completed` / `failed`，其余状态都当 pending，因此网关可以把排队状态返回成 `queued`。
- 网关可以做鉴权、限流、429/503 重试、任务取消和监控，而不需要修改 LobeHub 的提交逻辑。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/v1/videos` | 入队，返回 `{ id, status: "queued", queue_position }` |
| `GET` | `/v1/videos/{id}` | `queued` / `in_progress` / `completed` / `failed` |
| `GET` | `/v1/videos/{id}/content` | 完成后代理 MP4，支持 Range |
| `DELETE` | `/v1/videos/{id}` | 取消排队或运行中的任务 |
| `GET` | `/health` | 存活与上游地址 |
| `GET` | `/metrics` | Prometheus 文本指标 |

`GET` 成功时不返回 `url`。LobeHub 的 poller 在缺省时自己拼 `${baseURL}/videos/{id}/content`，这样下载地址始终是网关地址。

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `GUFO_UPSTREAM` | `http://192.168.197.157:8080` | ai07 gufo 根地址（不带 `/v1`） |
| `GATEWAY_TOKEN` | 空 | `Authorization: Bearer` 令牌；为空则不鉴权（仅限本机调试） |
| `PORT` | `8080` | 监听端口 |
| `REDIS_URL` | `redis://redis:6379` | 队列与任务状态 |
| `MAX_QUEUE` | `10` | 排队上限，超出返回 429 |
| `TASK_TIMEOUT_MS` | `2700000` | 单任务生成超时（45 分钟） |
| `MAX_WAIT_MS` | `3000000` | 排队等待上限（50 分钟） |
| `JOB_TTL_SECONDS` | `86400` | 任务记录保留时间 |

## 本地运行

```bash
cd apps/gufo-gateway
npm install
GUFO_UPSTREAM=http://192.168.197.157:8080 \
GATEWAY_TOKEN=dev-token \
REDIS_URL=redis://127.0.0.1:6379 \
node src/index.mjs
```

验证：

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/v1/videos \
  -H 'Authorization: Bearer dev-token' \
  -H 'Content-Type: application/json' \
  -d '{"model":"minimax-h3-fast","prompt":"a red fox in snow","size":"512x512","seconds":5}'
```

## 限流与公平性

一期是全局 FIFO：所有用户共用一条队列，`MAX_QUEUE` 控制上限。二期如果要按用户公平排队，需要 LobeHub 在请求里带上用户标识，网关再按用户限制在途任务数。

## Prometheus 抓取示例

```yaml
scrape_configs:
  - job_name: gufo-gateway
    metrics_path: /metrics
    static_configs:
      - targets: ['gufo-gateway:8080']
```

建议告警：`gufo_gateway_jobs_total{status="failed"}` 速率上升、`gufo_gateway_upstream_errors_total` 持续增长、ai07 GTT 接近 64 GiB 或 GPU 温度异常。

## 安全

- 网关本身不做 TLS；ai01 上应放在 Nginx/Caddy 后面，或只让容器网络访问。
- ai07 的 `8080` 不要暴露到公网；gufo 自身没有鉴权。
- `GATEWAY_TOKEN` 与 LobeHub provider 的 API Key 保持一致，不要写进前端。

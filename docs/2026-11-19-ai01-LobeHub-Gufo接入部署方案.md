# ai01 LobeHub 接入 ai07 Gufo MiniMax H3 部署方案

> 日期：2026-11-19
> 适用范围：ai01（192.168.197.151）自托管 LobeHub + ai07（192.168.197.157）gufo
> 目标：在 LobeHub 视频页使用 ai07 的 MiniMax H3，支持多人排队、首尾帧、可选时长

---

## 1. 架构

```text
浏览器（多人）
   │
   ▼
ai01: LobeHub（自定义镜像，含 gufo provider）
   │  provider baseURL = http://gufo-gateway:8080/v1
   ▼
ai01: gufo-gateway（单并发 FIFO + Redis）
   │  429/503 重试、鉴权、取消、/metrics
   ▼
ai07: gufo 8080（OpenAI 兼容 /v1/videos）
```

- gufo 自身 1 执行 + 1 排队，所以队列放在 ai01，而不是让 LobeHub 直接打 ai07。
- 网关返回的 `inferenceId` 是 `gufo-<uuid>`；LobeHub 会用它轮询 `GET /v1/videos/{id}` 和下载 `/content`。
- 网关**不返回 `url` 字段**，让 LobeHub 自己拼 `${baseURL}/videos/{id}/content`，保证下载经过网关。

---

## 2. 代码改动

| 位置 | 内容 |
|---|---|
| `packages/model-bank/src/modelProviders/gufo.ts` | 新增 Gufo provider 卡（OpenAI 兼容、服务端代理、默认关闭） |
| `packages/model-bank/src/aiModels/gufo.ts` | 4 个视频模型：fast / aggressive / exact / fullres |
| `packages/model-bank/src/const/modelProvider.ts` | `ModelProvider.Gufo` |
| `packages/model-bank/src/modelProviders/index.ts`、`aiModels/index.ts` | 注册与导出 |
| `packages/model-runtime/src/providers/gufo/index.ts` | `createGufoVideo` / `pollGufoVideoStatus`，第一/尾帧字段、429/503 文案、404 终态 |
| `packages/model-runtime/src/runtimeMap.ts`、`src/index.ts` | runtime 注册与导出 |
| `packages/business/config/src/server/route.ts` | `VIDEO_TASK_TIMEOUT`（`VIDEO_TASK_TIMEOUT_MS` 可覆盖，默认 59 分钟） |
| `apps/server/src/routers/async/video.ts`、`videoBackgroundPolling.ts` | 视频轮询改用 `VIDEO_TASK_TIMEOUT` |
| `apps/server/src/routers/lambda/video/index.ts` | gufo 首/尾帧在 lambda 中转 data URL |
| `apps/server/src/services/generation/videoReferenceImage.ts` | S3 URL → base64 data URL |
| `apps/gufo-gateway/` | 新的排队网关（Node + Redis） |
| `docker-compose/gufo/docker-compose.yml` | ai01 叠加编排 |

模型矩阵：

| 模型 | size | duration | 估算耗时 | 默认 |
|---|---|---|---|---|
| `minimax-h3-aggressive` | 512x512 | 1/5/10 | 191s / 382s | 5s |
| `minimax-h3-fast` | 512x512 | 1/5/10 | 232s / 464s | 5s |
| `minimax-h3`（exact） | 512x512 | 1/5 | 188s / 18.6min | 1s |
| `minimax-h3-fullres` | 1344x768 | 1 | 12min | 1s |

能力边界（gufo FL2VA）：

- 支持文生视频、首帧、尾帧、首尾帧；**不支持**多参考图（Ref2VA）、2K 重生成、`watermark`。
- `size` 只有 `512x512` / `1344x768`。
- `seconds` 只有 1 或 5–14.375；首尾帧必须是 base64 data URL，gufo 不抓远程 URL。

---

## 3. 构建与部署

### 3.1 构建自定义 LobeHub 镜像

因为新增了 provider，官方 `lobehub/lobehub` 镜像不含这些代码，必须用自己的镜像：

```bash
# 在仓库根目录（ai01 或 CI）
docker build -t registry.local/lobehub:gufo .

# 如果 ai01 是 ARM64
docker buildx build --platform linux/arm64 -t registry.local/lobehub:gufo .
```

### 3.2 准备 ai01 的 `.env`

在 `docker-compose/deploy` 使用的 `.env` 中增加：

```bash
LOBE_IMAGE=registry.local/lobehub:gufo
GUFO_GATEWAY_TOKEN=<随机 token>
GUFO_UPSTREAM=http://192.168.197.157:8080
GUFO_MAX_QUEUE=10
GUFO_TASK_TIMEOUT_MS=2700000
GUFO_MAX_WAIT_MS=3000000
VIDEO_TASK_TIMEOUT_MS=3540000
```

`GUFO_GATEWAY_TOKEN` 同时作为 LobeHub 里 Gufo provider 的 API Key。

### 3.3 启动

```bash
docker compose \
  -f docker-compose/deploy/docker-compose.yml \
  -f docker-compose/gufo/docker-compose.yml \
  up -d

docker logs -f gufo-gateway
```

验证：

```bash
curl -s http://127.0.0.1:18080/health
curl -s -H "Authorization: Bearer $GUFO_GATEWAY_TOKEN" \
  http://127.0.0.1:18080/v1/videos \
  -H 'Content-Type: application/json' \
  -d '{"model":"minimax-h3-fast","prompt":"a red fox in snow","size":"512x512","seconds":5}'
```

### 3.4 LobeHub 里启用 Gufo

1. 管理员登录 → 设置 → 服务商 → 找到 **Gufo (ai07)**。
2. 打开启用开关。
3. Base URL 填 `http://gufo-gateway:8080/v1`（容器网络内地址，必须带 `/v1`）。
4. API Key 填 `GUFO_GATEWAY_TOKEN`。
5. 保存后进入视频页，应看到 `H3 (ai07, fast)` 等模型。

> Provider 默认 `enabled: false`，避免没配地址就出现在视频页；每个部署只需启用一次。

---

## 4. 排队与超时

- 网关并发 1，队列上限 `MAX_QUEUE=10`；LobeHub 提交的任务在网关里排队。
- LobeHub 侧的 `VIDEO_TASK_TIMEOUT_MS` 默认 59 分钟，覆盖排队 + 生成；单个任务的实际上限由网关的 `TASK_TIMEOUT_MS`（45 分钟）和 `MAX_WAIT_MS`（50 分钟）控制。
- 排队中的任务在 LobeHub 里显示为“生成中”；队列满时提交会失败并提示 `gufo queue is full`。
- 如果后续要显示“排队第 N 位”，需要扩展 `PollVideoStatusResult` 与 asyncTask metadata；当前版本不显示位置。

---

## 5. 监控

网关指标：

```bash
curl -s http://127.0.0.1:18080/metrics
```

- `gufo_gateway_jobs_total{status=completed|failed|cancelled}`
- `gufo_gateway_rejected_total`
- `gufo_gateway_upstream_errors_total`

建议接入 ai01 现有 Prometheus/Grafana，并增加：

- 队列积压（可由 `jobs_total` 速率 + 日志估算）
- 网关失败率、429/503 次数
- ai07 的 GTT/VRAM/温度/功耗（已有 exporter）
- LobeHub 视频任务成功率

gufo 的 video 服务没有 `/metrics`，GPU 指标继续从 ai07 的 sysfs/Docker 采集。

---

## 6. 验收

1. 网关 health、创建/查询/content 全链路 curl。
2. LobeHub 视频页生成 1s 与 5s（fast/aggressive），确认任务成功、封面/缩略图/时长正确、S3 可播放。
3. 首帧 + 尾帧上传：确认 lambda 转 base64、gufo 成功返回；直接传远程 URL 应被拒绝。
4. 并发 3 个任务：确认排队行为、429 文案、最终完成顺序。
5. 10s fast：确认在 `VIDEO_TASK_TIMEOUT_MS` 内完成。
6. 重启网关：Redis 中排队/运行任务可恢复（运行中的任务由 gufo 持久化，网关重启后会用 `gufoId` 继续轮询）。
7. 失败路径：停 gufo 后提交，确认 503→重试→失败提示；不要留下永久 pending。
8. 安全：ai07 8080 公网不可达；网关端口不对公网开放；错 token 返回 401。

---

## 7. 回滚

```bash
# 只回滚网关
docker compose -f ... stop gufo-gateway

# LobeHub 回退镜像
LOBE_IMAGE=lobehub/lobehub docker compose ... up -d lobe

# 或在设置页关闭 Gufo provider
```

gufo/ai07 不动即可。

---

## 8. 已知限制

- gufo 单机单任务，吞吐由 GPU 决定；多人排队时等待时间可能较长。
- exact 5s 约 18.6 分钟，fullres 1s 约 12 分钟；不要把它们当默认模型。
- gufo 产物 TTL 默认 1 小时；建议把 ai07 的 `--ttl` 调到 7200–14400，避免排队很久后产物被删。
- 网关一期是全局 FIFO，不按用户公平调度。
- LobeHub 的 `after()` 轮询是进程内调度；ai01 单实例可用，多副本部署需要额外的任务恢复机制。
